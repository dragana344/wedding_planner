// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listAgendaItems, addAgendaItem, updateAgendaItem, deleteAgendaItem, moveAgendaItem } from "@/lib/couple/agenda";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/agenda", () => {
  it("adds items to the end, lists them in order, updates, moves, and deletes", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Agenda Test Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Agenda Couple", event_date: "2027-02-01" })
      .select()
      .single();

    const first = await addAgendaItem(event!.id, { time: "16:00", title: "Собирање гости", notes: null });
    const second = await addAgendaItem(event!.id, { time: "17:00", title: "Церемонија", notes: null });
    expect(first.sort_order).toBe(0);
    expect(second.sort_order).toBe(1);

    const listed = await listAgendaItems(event!.id);
    expect(listed.map((i) => i.title)).toEqual(["Собирање гости", "Церемонија"]);

    const updated = await updateAgendaItem(event!.id, first.id, { time: "16:30", title: "Собирање гости (ажурирано)", notes: "донеси стол" });
    expect(updated.title).toBe("Собирање гости (ажурирано)");
    expect(updated.notes).toBe("донеси стол");

    const afterMove = await moveAgendaItem(event!.id, second.id, "up");
    expect(afterMove.map((i) => i.id)).toEqual([second.id, first.id]);

    await deleteAgendaItem(event!.id, first.id);
    const afterDelete = await listAgendaItems(event!.id);
    expect(afterDelete).toHaveLength(1);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("scopes updates and deletes to the given event, refusing to touch another event's item", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Agenda Scope Venue" }).select().single();
    const { data: eventA } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "A", event_date: "2027-02-02" })
      .select()
      .single();
    const { data: eventB } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "B", event_date: "2027-02-03" })
      .select()
      .single();

    const item = await addAgendaItem(eventA!.id, { time: null, title: "A's item", notes: null });

    await expect(updateAgendaItem(eventB!.id, item.id, { time: null, title: "hijacked", notes: null })).rejects.toThrow();
    await deleteAgendaItem(eventB!.id, item.id);
    const stillThere = await listAgendaItems(eventA!.id);
    expect(stillThere).toHaveLength(1);

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
