import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("0023 schema: budget and checklist", () => {
  it("creates a budget item and a checklist item", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "0023 Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "0023 Couple", event_date: "2027-08-01" })
      .select()
      .single();

    const { data: budgetItem, error: budgetError } = await admin
      .from("event_budget_items")
      .insert({ event_id: event!.id, category: "catering", name: "Restaurant X", estimated_amount: 5000, paid_amount: 1000 })
      .select()
      .single();
    expect(budgetError).toBeNull();
    expect(budgetItem!.name).toBe("Restaurant X");
    expect(budgetItem!.paid_amount).toBe(1000);

    const { error: badCategoryError } = await admin
      .from("event_budget_items")
      .insert({ event_id: event!.id, category: "not-a-real-category", name: "Bad" });
    expect(badCategoryError).not.toBeNull();

    const { error: negativePaidError } = await admin
      .from("event_budget_items")
      .insert({ event_id: event!.id, category: "other", name: "Negative", paid_amount: -5 });
    expect(negativePaidError).not.toBeNull();

    const { data: checklistItem, error: checklistError } = await admin
      .from("event_checklist_items")
      .insert({ event_id: event!.id, title: "Book photographer", due_date: "2027-01-01" })
      .select()
      .single();
    expect(checklistError).toBeNull();
    expect(checklistItem!.is_done).toBe(false);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("cascades deletes from events to both new tables", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "0023 Cascade Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Cascade Couple", event_date: "2027-08-02" })
      .select()
      .single();
    await admin.from("event_budget_items").insert({ event_id: event!.id, category: "other", name: "Test" });
    await admin.from("event_checklist_items").insert({ event_id: event!.id, title: "Test" });

    await admin.from("events").delete().eq("id", event!.id);

    const { data: budgetItems } = await admin.from("event_budget_items").select("id").eq("event_id", event!.id);
    const { data: checklistItems } = await admin.from("event_checklist_items").select("id").eq("event_id", event!.id);
    expect(budgetItems).toHaveLength(0);
    expect(checklistItems).toHaveLength(0);

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
