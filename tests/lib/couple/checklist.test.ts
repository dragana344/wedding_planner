// tests/lib/couple/checklist.test.ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  listChecklistItems,
  addChecklistItem,
  updateChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  getChecklistStats,
  computeChecklistStats,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
} from "@/lib/couple/checklist";
import { STARTER_CHECKLIST_TITLES } from "@/lib/couple/checklist-templates";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/checklist", () => {
  it("auto-seeds the starter checklist on first read, and only once", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Checklist Seed Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Seed Couple", event_date: "2027-10-01" })
      .select()
      .single();

    const first = await listChecklistItems(event!.id);
    expect(first).toHaveLength(STARTER_CHECKLIST_TITLES.length);
    expect(first.every((i) => i.due_date === null && i.is_done === false)).toBe(true);
    expect(first.map((i) => i.title).sort()).toEqual([...STARTER_CHECKLIST_TITLES].sort());

    await deleteChecklistItem(event!.id, first[0].id);
    const second = await listChecklistItems(event!.id);
    expect(second).toHaveLength(STARTER_CHECKLIST_TITLES.length - 1);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("adds, updates, toggles done, computes stats including overdue, and deletes", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Checklist Test Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Checklist Couple", event_date: "2027-10-02" })
      .select()
      .single();
    await listChecklistItems(event!.id); // seed, then start from a clean slate for this test's own items
    await admin.from("event_checklist_items").delete().eq("event_id", event!.id);

    const overdue = await addChecklistItem(event!.id, { title: "Overdue task", due_date: "2020-01-01" });
    const upcoming = await addChecklistItem(event!.id, { title: "Future task", due_date: "2099-01-01" });
    const noDate = await addChecklistItem(event!.id, { title: "No date task", due_date: null });

    const updated = await updateChecklistItem(event!.id, noDate.id, { title: "No date task (renamed)", due_date: "2099-06-01" });
    expect(updated.title).toBe("No date task (renamed)");

    await toggleChecklistItem(event!.id, upcoming.id, true);

    const stats = await getChecklistStats(event!.id);
    expect(stats).toEqual({ total: 3, open: 2, done: 1, overdue: 1 });

    await deleteChecklistItem(event!.id, overdue.id);
    expect(await listChecklistItems(event!.id)).toHaveLength(2);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("refuses to update, toggle, or delete an item belonging to a different event", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Checklist Scope Venue" }).select().single();
    const { data: eventA } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "A", event_date: "2027-10-03" }).select().single();
    const { data: eventB } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "B", event_date: "2027-10-04" }).select().single();

    const item = await addChecklistItem(eventA!.id, { title: "A's task", due_date: null });
    await expect(updateChecklistItem(eventB!.id, item.id, { title: "hijacked", due_date: null })).rejects.toThrow();
    await expect(toggleChecklistItem(eventB!.id, item.id, true)).rejects.toThrow();
    await deleteChecklistItem(eventB!.id, item.id);

    const stillThere = await admin.from("event_checklist_items").select("id").eq("id", item.id).single();
    expect(stillThere.data).not.toBeNull();

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("computeChecklistStats is a pure function over an already-fetched item list", () => {
    const today = new Date().toISOString().slice(0, 10);
    const items = [
      { id: "1", event_id: "e", title: "a", due_date: "2020-01-01", is_done: false, created_at: "2020-01-01T00:00:00Z", subtasks: [] },
      { id: "2", event_id: "e", title: "b", due_date: "2099-01-01", is_done: false, created_at: "2020-01-01T00:00:00Z", subtasks: [] },
      { id: "3", event_id: "e", title: "c", due_date: null, is_done: true, created_at: "2020-01-01T00:00:00Z", subtasks: [] },
    ];
    expect(computeChecklistStats(items)).toEqual({ total: 3, open: 2, done: 1, overdue: 1 });
    expect(computeChecklistStats([])).toEqual({ total: 0, open: 0, done: 0, overdue: 0 });
    // sanity: overdue boundary is strictly before today, not including today
    expect(
      computeChecklistStats([
        { id: "4", event_id: "e", title: "d", due_date: today, is_done: false, created_at: "2020-01-01T00:00:00Z", subtasks: [] },
      ]).overdue
    ).toBe(0);
  });

  it("does not re-seed after the couple deletes every checklist item", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Checklist Empty-After-Delete Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Empty After Delete Couple", event_date: "2027-10-07" })
      .select()
      .single();

    const seeded = await listChecklistItems(event!.id);
    expect(seeded).toHaveLength(STARTER_CHECKLIST_TITLES.length);

    for (const item of seeded) {
      await deleteChecklistItem(event!.id, item.id);
    }

    const afterDelete = await listChecklistItems(event!.id);
    expect(afterDelete).toEqual([]);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("does not double-seed when the route's single-fetch pattern is used on a brand-new event", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Checklist Route Pattern Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Route Pattern Couple", event_date: "2027-10-05" })
      .select()
      .single();

    // This mirrors what GET /api/couple/checklist now does: exactly one listChecklistItems
    // call, with stats derived from that same result via computeChecklistStats, instead of
    // a second independent listChecklistItems call (via getChecklistStats) that could race
    // the seeding insert and double-seed the event.
    const items = await listChecklistItems(event!.id);
    const stats = computeChecklistStats(items);

    expect(items).toHaveLength(STARTER_CHECKLIST_TITLES.length);
    expect(stats.total).toBe(STARTER_CHECKLIST_TITLES.length);

    const { count } = await admin
      .from("event_checklist_items")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event!.id);
    expect(count).toBe(STARTER_CHECKLIST_TITLES.length);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("no longer double-seeds under concurrency, now that seeding is claimed atomically via checklist_seeded_at", async () => {
    // Previously-documented residual risk: listChecklistItems was not concurrency-safe
    // (no marker guarding the seed insert), so two concurrent calls on the same brand-new
    // event could both observe zero existing rows and both insert the starter set,
    // producing double the rows. The atomic claim (UPDATE ... WHERE checklist_seeded_at IS
    // NULL) now closes that race: only one concurrent caller can win the claim and seed.
    const { data: venue } = await admin.from("venues").insert({ name: "Checklist Concurrency Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Concurrency Couple", event_date: "2027-10-06" })
      .select()
      .single();

    await Promise.all([listChecklistItems(event!.id), listChecklistItems(event!.id)]);

    const { count } = await admin
      .from("event_checklist_items")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event!.id);
    expect(count).toBe(STARTER_CHECKLIST_TITLES.length);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("adds, toggles, and deletes subtasks under a checklist item, independent of the parent's is_done", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Checklist Subtasks Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Subtasks Couple", event_date: "2027-10-07" })
      .select()
      .single();

    const item = await addChecklistItem(event!.id, { title: "Find photographer", due_date: null });
    const a = await addSubtask(event!.id, item.id, "Photographer A");
    const b = await addSubtask(event!.id, item.id, "Photographer B");
    expect(a.is_done).toBe(false);

    const [items] = [await listChecklistItems(event!.id)];
    const found = items.find((i) => i.id === item.id)!;
    expect(found.subtasks.map((s) => s.title)).toEqual(["Photographer A", "Photographer B"]);

    const toggled = await toggleSubtask(event!.id, item.id, a.id, true);
    expect(toggled.is_done).toBe(true);

    // Toggling a subtask must not touch the parent's own is_done.
    const stillOpen = (await listChecklistItems(event!.id)).find((i) => i.id === item.id)!;
    expect(stillOpen.is_done).toBe(false);
    expect(stillOpen.subtasks.find((s) => s.id === a.id)!.is_done).toBe(true);

    await deleteSubtask(event!.id, item.id, b.id);
    const afterDelete = (await listChecklistItems(event!.id)).find((i) => i.id === item.id)!;
    expect(afterDelete.subtasks).toHaveLength(1);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("refuses to add, toggle, or delete a subtask under an item belonging to a different event", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Checklist Subtasks Scope Venue" }).select().single();
    const { data: eventA } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "A", event_date: "2027-10-08" }).select().single();
    const { data: eventB } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "B", event_date: "2027-10-09" }).select().single();

    const item = await addChecklistItem(eventA!.id, { title: "A's task", due_date: null });
    await expect(addSubtask(eventB!.id, item.id, "hijacked")).rejects.toThrow();

    const subtask = await addSubtask(eventA!.id, item.id, "Real subtask");
    await expect(toggleSubtask(eventB!.id, item.id, subtask.id, true)).rejects.toThrow();
    await expect(deleteSubtask(eventB!.id, item.id, subtask.id)).rejects.toThrow();

    const stillThere = await admin.from("event_checklist_subtasks").select("id").eq("id", subtask.id).single();
    expect(stillThere.data).not.toBeNull();

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
