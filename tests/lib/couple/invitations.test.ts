// tests/lib/couple/invitations.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getInvitation, upsertInvitation, getInvitationBySlug } from "@/lib/couple/invitations";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/invitations", () => {
  it("creates an invitation on first upsert, keeps the same slug on later upserts, and is readable by slug", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Invitation Venue" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Hall" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Invitation Couple", event_date: "2027-06-01" })
      .select()
      .single();
    await admin.from("event_rooms").insert({ event_id: event!.id, room_id: room!.id });

    expect(await getInvitation(event!.id)).toBeNull();

    const created = await upsertInvitation(event!.id, { template_id: "romantic-floral", message: "Се гледаме!" });
    expect(created.public_slug).toBeTruthy();

    const updated = await upsertInvitation(event!.id, { template_id: "elegant-gold", message: "Изменета порака" });
    expect(updated.public_slug).toBe(created.public_slug);
    expect(updated.template_id).toBe("elegant-gold");

    const public_ = await getInvitationBySlug(created.public_slug);
    expect(public_?.couple_names).toBe("Invitation Couple");
    expect(public_?.venue_name).toBe("Invitation Venue");
    expect(public_?.room_names).toEqual(["Hall"]);
    expect(public_?.template_id).toBe("elegant-gold");

    expect(await getInvitationBySlug("no-such-slug")).toBeNull();

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
