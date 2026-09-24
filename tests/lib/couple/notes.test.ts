// tests/lib/couple/notes.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listNotes, createNote, updateNote, deleteNote, deriveNoteDisplay } from "@/lib/couple/notes";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/notes", () => {
  it("creates, lists (newest updated first), updates and deletes notes for an event", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Notes Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Notes Couple", event_date: "2027-06-01" })
      .select()
      .single();

    expect(await listNotes(event!.id)).toEqual([]);

    const first = await createNote(event!.id, { title: "Vendors", content: "Ask about corkage fee" });
    expect(first.title).toBe("Vendors");

    const second = await createNote(event!.id, { title: null, content: "Book florist\nCall by Friday" });
    expect(second.title).toBeNull();

    // Newest-updated first.
    let list = await listNotes(event!.id);
    expect(list.map((n) => n.id)).toEqual([second.id, first.id]);

    const updated = await updateNote(event!.id, first.id, { title: "Vendors!", content: "Ask about corkage fee" });
    expect(updated.title).toBe("Vendors!");

    list = await listNotes(event!.id);
    expect(list[0].id).toBe(first.id); // touched again, now newest

    await deleteNote(event!.id, second.id);
    list = await listNotes(event!.id);
    expect(list.map((n) => n.id)).toEqual([first.id]);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("derives a list-row title and preview the way Apple Notes does", () => {
    // Explicit title present: title stays as-is, preview is the content's
    // first non-blank line (title hasn't "consumed" any of it).
    expect(deriveNoteDisplay("Vendors", "Ask about corkage fee\nCall photographer")).toEqual({
      title: "Vendors",
      preview: "Ask about corkage fee",
    });

    // No explicit title: first non-blank line becomes the title, the next
    // non-blank line becomes the preview.
    expect(deriveNoteDisplay(null, "Book florist\nCall by Friday")).toEqual({
      title: "Book florist",
      preview: "Call by Friday",
    });

    // Blank lines are skipped, not treated as the title/preview.
    expect(deriveNoteDisplay(null, "\n\nBook florist\n\nCall by Friday")).toEqual({
      title: "Book florist",
      preview: "Call by Friday",
    });

    // Single line, no explicit title: title only, no preview.
    expect(deriveNoteDisplay(null, "Book florist")).toEqual({ title: "Book florist", preview: "" });

    // Nothing at all falls back to a placeholder rather than an empty title.
    expect(deriveNoteDisplay(null, "")).toEqual({ title: "Untitled note", preview: "" });
    expect(deriveNoteDisplay("  ", "   ")).toEqual({ title: "Untitled note", preview: "" });
  });
});
