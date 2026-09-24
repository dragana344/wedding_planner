// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listBudgetItems, addBudgetItem, updateBudgetItem, deleteBudgetItem, getBudgetSummary } from "@/lib/couple/budget";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/budget", () => {
  it("adds, lists, updates, deletes items, and computes a summary including the live venue line", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Budget Test Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({
        venue_id: venue!.id,
        couple_names: "Budget Couple",
        event_date: "2027-09-01",
        total_price: 9000,
        deposit_paid: 2000,
      })
      .select()
      .single();

    const catering = await addBudgetItem(event!.id, {
      category: "catering",
      custom_label: null,
      name: "Restaurant X",
      estimated_amount: 5000,
      paid_amount: 1000,
    });
    const flowers = await addBudgetItem(event!.id, {
      category: "flowers_decor",
      custom_label: null,
      name: "Florist Y",
      estimated_amount: 800,
      paid_amount: 0,
    });
    expect(catering.name).toBe("Restaurant X");

    const listed = await listBudgetItems(event!.id);
    expect(listed).toHaveLength(2);

    const updated = await updateBudgetItem(event!.id, catering.id, {
      category: "catering",
      custom_label: null,
      name: "Restaurant X (confirmed)",
      estimated_amount: 5200,
      paid_amount: 2000,
    });
    expect(updated.paid_amount).toBe(2000);

    const summary = await getBudgetSummary(event!.id);
    expect(summary.venue).toEqual({ estimated_amount: 9000, paid_amount: 2000 });
    expect(summary.items).toHaveLength(2);
    // venue (9000 est / 2000 paid) + catering (5200/2000) + flowers (800/0)
    expect(summary.totalEstimated).toBe(9000 + 5200 + 800);
    expect(summary.totalPaid).toBe(2000 + 2000 + 0);
    expect(summary.remaining).toBe(summary.totalEstimated - summary.totalPaid);

    await deleteBudgetItem(event!.id, flowers.id);
    expect(await listBudgetItems(event!.id)).toHaveLength(1);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("treats null venue price/deposit as 0 in the summary, and reports them as null on the venue line", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Budget Null Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Null Couple", event_date: "2027-09-02" })
      .select()
      .single();

    const summary = await getBudgetSummary(event!.id);
    expect(summary.venue).toEqual({ estimated_amount: null, paid_amount: null });
    expect(summary.totalEstimated).toBe(0);
    expect(summary.totalPaid).toBe(0);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("lists items in fixed category order (catalog order, not alphabetical), with 'other' last", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Budget Category Order Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Category Order Couple", event_date: "2027-09-05" })
      .select()
      .single();

    // Insert in an order that is neither alphabetical nor catalog order.
    await addBudgetItem(event!.id, { category: "videography", custom_label: null, name: "Videographer", estimated_amount: 100, paid_amount: 0 });
    await addBudgetItem(event!.id, { category: "attire", custom_label: null, name: "Dress", estimated_amount: 100, paid_amount: 0 });
    await addBudgetItem(event!.id, { category: "other", custom_label: "Misc", name: "Misc item", estimated_amount: 100, paid_amount: 0 });
    await addBudgetItem(event!.id, { category: "catering", custom_label: null, name: "Caterer", estimated_amount: 100, paid_amount: 0 });

    const listed = await listBudgetItems(event!.id);
    // Catalog order (lib/couple/budget-categories.ts) is: catering, photography,
    // videography, flowers_decor, music_entertainment, attire, invitations_stationery,
    // transportation, other — so videography precedes attire, and other is last.
    expect(listed.map((i) => i.category)).toEqual(["catering", "videography", "attire", "other"]);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("refuses to update or delete an item belonging to a different event", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Budget Scope Venue" }).select().single();
    const { data: eventA } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "A", event_date: "2027-09-03" }).select().single();
    const { data: eventB } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "B", event_date: "2027-09-04" }).select().single();

    const item = await addBudgetItem(eventA!.id, { category: "other", custom_label: "Misc", name: "A's item", estimated_amount: null, paid_amount: 0 });
    await expect(
      updateBudgetItem(eventB!.id, item.id, { category: "other", custom_label: null, name: "hijacked", estimated_amount: null, paid_amount: 0 })
    ).rejects.toThrow();
    await deleteBudgetItem(eventB!.id, item.id);
    expect(await listBudgetItems(eventA!.id)).toHaveLength(1);

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
