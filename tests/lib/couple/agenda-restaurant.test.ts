// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listAgendaItems, deleteAgendaItem } from "@/lib/couple/agenda";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function must(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<{ id: string }> {
  const { data, error } = await q;
  if (error || data === null) throw new Error(error?.message ?? "no data");
  return data as { id: string };
}

async function setup(venueFields: Record<string, unknown>, eventFields: Record<string, unknown> = {}) {
  const venue = await must(admin.from("venues").insert({ name: "Ресторан Тест", ...venueFields }).select("id").single());
  const event = await must(
    admin.from("events").insert({ venue_id: venue.id, couple_names: "Пар Тест", event_date: "2027-06-05", start_time: "18:30", ...eventFields }).select("id").single(),
  );
  const room = (name: string, extra: Record<string, unknown> = {}) =>
    must(admin.from("rooms").insert({ venue_id: venue.id, name, ...extra }).select("id").single());
  return { venueId: venue.id as string, eventId: event.id as string, room };
}

describe("0158: the restaurant starts in a new event's agenda", () => {
  it("adds one item with the start time, the hall and the venue's address when the first hall is booked", async () => {
    const { venueId, eventId, room } = await setup({ address: "Водно бб, Скопје" });
    const hall = await room("Голема сала");
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: hall.id }).select("event_id").single());

    const items = await listAgendaItems(eventId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Ресторан Тест",
      time: "18:30:00",
      location: "Ресторан Тест – Голема сала",
      address: "Водно бб, Скопје",
      map_url: null,
    });
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("uses the booked halls' own address and map link, and names every hall, once", async () => {
    const { venueId, eventId, room } = await setup({ address: "Венуе адреса 1" });
    const a = await room("А сала");
    const b = await room("Б сала", { address: "Друга зграда 5", map_url: "https://maps.example/b" });
    await must(admin.from("event_rooms").insert([{ event_id: eventId, room_id: a.id }, { event_id: eventId, room_id: b.id }]).select("event_id"));

    const items = await listAgendaItems(eventId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ location: "Ресторан Тест – А сала, Б сала", address: "Друга зграда 5", map_url: "https://maps.example/b" });
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("is added only once: a deleted item stays deleted and a second hall adds nothing", async () => {
    const { venueId, eventId, room } = await setup({});
    const a = await room("А сала");
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: a.id }).select("event_id").single());
    const [item] = await listAgendaItems(eventId);
    await deleteAgendaItem(eventId, item.id);

    const b = await room("Б сала");
    await must(admin.from("event_rooms").insert({ event_id: eventId, room_id: b.id }).select("event_id").single());
    expect(await listAgendaItems(eventId)).toHaveLength(0);
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("leaves table-reservation events and events that were already marked alone", async () => {
    const mini = await setup({}, { seating_mode: "mini" });
    await must(admin.from("event_rooms").insert({ event_id: mini.eventId, room_id: (await mini.room("А")).id }).select("event_id").single());
    expect(await listAgendaItems(mini.eventId)).toHaveLength(0);

    const old = await setup({}, { agenda_seeded_at: new Date().toISOString() });
    await must(admin.from("event_rooms").insert({ event_id: old.eventId, room_id: (await old.room("А")).id }).select("event_id").single());
    expect(await listAgendaItems(old.eventId)).toHaveLength(0);
    await admin.from("venues").delete().in("id", [mini.venueId, old.venueId]);
  });
});
