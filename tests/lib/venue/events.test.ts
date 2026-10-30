// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  listEvents,
  createEvent,
  isVenueStaffForEvent,
  getEventById,
  listEventsWithDetails,
  updateEvent,
  updateEventContactInfo,
  updateEventFinance,
  PastEventError,
} from "@/lib/venue/events";
import { todayIn } from "@/lib/date";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let venueId: string;

describe("events data layer: listEvents", () => {
  beforeAll(async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Events List Test Venue" }).select().single();
    venueId = venue!.id;
    await admin.from("events").insert({
      venue_id: venueId,
      couple_names: "Ana & Marko",
      event_date: "2026-09-12",
      guest_count_estimate: 120,
    });
  });

  afterAll(async () => {
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("lists events for a venue ordered by date", async () => {
    const events = await listEvents(venueId);
    expect(events).toHaveLength(1);
    expect(events[0].couple_names).toBe("Ana & Marko");
    expect(events[0].guest_count_estimate).toBe(120);
  });
});

describe("events data layer: listEventsWithDetails seatedCount", () => {
  it("sums seats across placed tables of the event's own table types, ignoring non-table elements", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Seating Summary Test Venue" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Hall" }).select().single();
    const { data: tableType } = await admin
      .from("table_types")
      .insert({ room_id: room!.id, name: "Round-8", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 5 })
      .select()
      .single();
    const { data: event } = await admin
      .from("events")
      .insert({
        venue_id: venue!.id,
        couple_names: "Seating & Summary",
        event_date: "2026-09-20",
        guest_count_estimate: 30,
      })
      .select()
      .single();
    await admin.from("event_rooms").insert({ event_id: event!.id, room_id: room!.id });
    // Two placed tables of the same type (8 seats each) plus one non-table element (should not count).
    await admin.from("event_layout_elements").insert([
      {
        event_id: event!.id,
        room_id: room!.id,
        element_type: "table",
        table_type_id: tableType!.id,
        x_cm: 0,
        y_cm: 0,
        width_cm: 150,
        length_cm: 150,
      },
      {
        event_id: event!.id,
        room_id: room!.id,
        element_type: "table",
        table_type_id: tableType!.id,
        x_cm: 200,
        y_cm: 0,
        width_cm: 150,
        length_cm: 150,
      },
      {
        event_id: event!.id,
        room_id: room!.id,
        element_type: "dance_floor",
        table_type_id: null,
        x_cm: 400,
        y_cm: 0,
        width_cm: 200,
        length_cm: 200,
      },
    ]);

    const events = await listEventsWithDetails(venue!.id, admin);
    expect(events).toHaveLength(1);
    expect(events[0].seatedCount).toBe(16);
    expect(events[0].guest_count_estimate).toBe(30);
    expect(events[0].menus).toEqual([]);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("returns every linked menu with its items, and flags event-only custom menus", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Menus List Test Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Menus Couple", event_date: "2026-09-21" })
      .select()
      .single();
    const { data: standard } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "Стандардно" }).select().single();
    const { data: custom } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "Посебно", event_id: event!.id }).select().single();
    const { data: chicken } = await admin
      .from("menu_items")
      .insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "Roast Chicken" })
      .select()
      .single();
    await admin.from("menu_template_items").insert({ menu_template_id: standard!.id, menu_item_id: chicken!.id });
    await admin.from("event_menu_templates").insert([
      { event_id: event!.id, menu_template_id: standard!.id },
      { event_id: event!.id, menu_template_id: custom!.id },
    ]);

    const events = await listEventsWithDetails(venue!.id, admin);
    const menus = [...events[0].menus].sort((x, y) => x.name.localeCompare(y.name));
    expect(menus.map((m) => [m.name, m.isCustom])).toEqual([["Посебно", true], ["Стандардно", false]]);
    expect(menus.find((m) => m.id === standard!.id)!.items).toEqual([
      { id: chicken!.id, name: "Roast Chicken", course: "main", photo_path: null },
    ]);
    expect(menus.find((m) => m.id === custom!.id)!.items).toEqual([]);

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});

describe("events data layer: createEvent", () => {
  it("creates an event linked to the given rooms and menu template", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Create Event Test Venue" }).select().single();
    const { data: room } = await admin.from("rooms").insert({ venue_id: venue!.id, name: "Garden" }).select().single();
    const { data: template } = await admin
      .from("menu_templates")
      .insert({ venue_id: venue!.id, name: "Standard Menu" })
      .select()
      .single();

    const event = await createEvent({
      venue_id: venue!.id,
      couple_names: "Ivana & Petar",
      event_date: "2099-10-01",
      room_ids: [room!.id],
      menu_template_ids: [template!.id],
      contacts: { contact_email: "ivana@example.mk", contact_phone: "070 123 456" },
      credentials: { username: `ivana-petar-${Date.now()}`, password: "a-strong-password-1" },
    });

    const { data: linkedRooms } = await admin.from("event_rooms").select("room_id").eq("event_id", event.id);
    expect(linkedRooms).toHaveLength(1);
    expect(linkedRooms![0].room_id).toBe(room!.id);
    // A21: the couple's contacts are saved with the event itself.
    const { data: saved } = await admin.from("events").select("contact_email, contact_email_2, contact_phone").eq("id", event.id).single();
    expect(saved).toEqual({ contact_email: "ivana@example.mk", contact_email_2: null, contact_phone: "070 123 456" });
    // Security review fix: the couple's login is created atomically with the
    // event, server-side — no separate client-side RPC call needed anymore.
    const { data: createdCredentials } = await admin.from("event_credentials").select("event_id").eq("event_id", event.id).maybeSingle();
    expect(createdCredentials).not.toBeNull();

    await expect(
      createEvent({
        venue_id: venue!.id,
        couple_names: "No Contacts",
        event_date: "2026-10-02",
        room_ids: [],
        menu_template_ids: [],
        contacts: { contact_email: "", contact_phone: "070 123 456" },
        credentials: { username: `no-contacts-${Date.now()}`, password: "a-strong-password-1" },
      }),
    ).rejects.toThrow("Внесете email на парот.");
    const { data: none } = await admin.from("events").select("id").eq("couple_names", "No Contacts");
    expect(none).toEqual([]);

    // Security review fix: if credential creation fails (e.g. a username
    // collision), the just-inserted event is rolled back too — the route
    // used to rely on the browser making a second, separate RPC call and a
    // client-side compensating delete if that failed; now it's one atomic
    // server-side step.
    const takenUsername = `taken-username-${Date.now()}`;
    await createEvent({
      venue_id: venue!.id,
      couple_names: "First Claim",
      event_date: "2026-10-03",
      room_ids: [],
      menu_template_ids: [],
      contacts: { contact_email: "first@example.mk", contact_phone: "070 000 000" },
      credentials: { username: takenUsername, password: "a-strong-password-1" },
    });
    await expect(
      createEvent({
        venue_id: venue!.id,
        couple_names: "Collides On Username",
        event_date: "2026-10-04",
        room_ids: [],
        menu_template_ids: [],
        contacts: { contact_email: "second@example.mk", contact_phone: "070 111 111" },
        credentials: { username: takenUsername, password: "a-strong-password-1" },
      }),
      // Any taken username (another couple's or a co-organizer's) comes back
      // as a unique violation, which createEvent turns into the Macedonian
      // message staff can act on — and the whole event rolls back.
    ).rejects.toThrow("Корисничкото име е веќе зафатено. Изберете друго.");
    const { data: orphaned } = await admin.from("events").select("id").eq("couple_names", "Collides On Username");
    expect(orphaned).toEqual([]);

    await expect(updateEventContactInfo(event.id, venue!.id, { contact_email: "ivana@example.mk", contact_email_2: null, contact_phone: "" })).rejects.toThrow(
      "Внесете телефон на парот.",
    );

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("createEvent links every chosen menu", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Multi Menu Test Venue" }).select().single();
    const { data: classic } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "Класично" }).select().single();
    const { data: posno } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "Посно" }).select().single();

    const event = await createEvent({
      venue_id: venue!.id,
      couple_names: "Ана и Петар",
      event_date: "2099-10-05",
      room_ids: [],
      menu_template_ids: [classic!.id, posno!.id],
      contacts: { contact_email: "ana@example.mk", contact_phone: "070 222 333" },
      credentials: { username: `ana-petar-${Date.now()}`, password: "a-strong-password-1" },
    });

    const { data: linkedMenus } = await admin.from("event_menu_templates").select("menu_template_id").eq("event_id", event.id);
    expect((linkedMenus ?? []).map((r) => r.menu_template_id).sort()).toEqual([classic!.id, posno!.id].sort());

    await expect(
      createEvent({
        venue_id: venue!.id,
        couple_names: "Foreign Menu",
        event_date: "2099-10-06",
        room_ids: [],
        menu_template_ids: ["00000000-0000-4000-8000-000000000000"],
        contacts: { contact_email: "x@example.mk", contact_phone: "070 000 111" },
        credentials: { username: `foreign-menu-${Date.now()}`, password: "a-strong-password-1" },
      }),
    ).rejects.toThrow("Едно или повеќе менија не припаѓаат на овој локал.");

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("updateEvent replaces the menu list and drops guest counts of unlinked menus", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Update Menus Test Venue" }).select().single();
    const { data: a } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "A" }).select().single();
    const { data: b } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "B" }).select().single();
    const event = await createEvent({
      venue_id: venue!.id,
      couple_names: "Update Menus",
      event_date: "2099-12-05",
      room_ids: [],
      menu_template_ids: [a!.id, b!.id],
      contacts: { contact_email: "um@example.mk", contact_phone: "070 111 222" },
      credentials: { username: `update-menus-${Date.now()}`, password: "a-strong-password-1" },
    });
    const { data: guest } = await admin.from("event_guests").insert({ event_id: event.id, full_name: "Гостин" }).select("id").single();
    await admin.from("event_guest_menu_counts").insert([
      { guest_id: guest!.id, menu_template_id: a!.id, count: 1 },
      { guest_id: guest!.id, menu_template_id: b!.id, count: 1 },
    ]);

    await updateEvent(event.id, venue!.id, {
      couple_names: "Update Menus", event_date: "2099-12-05", start_time: null, end_time: null,
      status: "preparation", event_type: "wedding", guest_count_estimate: null, room_ids: [],
      added_menu_ids: [], removed_menu_ids: [a!.id],
    }, admin);

    const { data: linked } = await admin.from("event_menu_templates").select("menu_template_id").eq("event_id", event.id);
    expect((linked ?? []).map((r) => r.menu_template_id)).toEqual([b!.id]);
    const { data: counts } = await admin.from("event_guest_menu_counts").select("menu_template_id").eq("guest_id", guest!.id);
    expect((counts ?? []).map((r) => r.menu_template_id)).toEqual([b!.id]);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("a stale window's save is a diff: menus linked or built meanwhile survive", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Stale Window Venue" }).select().single();
    const { data: p1 } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "P1" }).select().single();
    const { data: p2 } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "P2" }).select().single();
    const event = await createEvent({
      venue_id: venue!.id, couple_names: "Stale", event_date: "2099-12-10", room_ids: [], menu_template_ids: [p1!.id],
      contacts: { contact_email: "stale@example.mk", contact_phone: "070 111 555" },
      credentials: { username: `stale-${Date.now()}`, password: "a-strong-password-1" },
    });
    // Window A has seen [P1]; meanwhile P2 is linked and a custom menu C is built.
    const { data: c } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "C", event_id: event.id }).select().single();
    await admin.from("event_menu_templates").insert([
      { event_id: event.id, menu_template_id: p2!.id },
      { event_id: event.id, menu_template_id: c!.id },
    ]);
    const base = {
      couple_names: "Stale", event_date: "2099-12-10", start_time: null, end_time: null,
      status: "preparation" as const, event_type: "wedding" as const, guest_count_estimate: null, room_ids: [] as string[],
    };
    const linked = async () =>
      ((await admin.from("event_menu_templates").select("menu_template_id").eq("event_id", event.id)).data ?? [])
        .map((r) => r.menu_template_id).sort();

    await updateEvent(event.id, venue!.id, { ...base, added_menu_ids: [], removed_menu_ids: [] }, admin);
    expect(await linked()).toEqual([p1!.id, p2!.id, c!.id].sort());
    expect((await admin.from("menu_templates").select("id").eq("id", c!.id)).data).toHaveLength(1);

    await updateEvent(event.id, venue!.id, { ...base, added_menu_ids: [], removed_menu_ids: [p1!.id] }, admin);
    expect(await linked()).toEqual([p2!.id, c!.id].sort());
    expect((await admin.from("menu_templates").select("id").eq("id", c!.id)).data).toHaveLength(1);

    await updateEvent(event.id, venue!.id, { ...base, added_menu_ids: [p1!.id], removed_menu_ids: [c!.id] }, admin);
    expect(await linked()).toEqual([p1!.id, p2!.id].sort());
    expect((await admin.from("menu_templates").select("id").eq("id", c!.id)).data).toHaveLength(0);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("two concurrent saves on different menus both land (0124: the diff is applied by id, never a recomputed full list)", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Concurrent Menus Venue" }).select().single();
    const { data: a } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "A" }).select().single();
    const { data: b } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "B" }).select().single();
    const { data: c } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "C" }).select().single();
    const event = await createEvent({
      venue_id: venue!.id, couple_names: "Concurrent", event_date: "2099-12-12", room_ids: [],
      menu_template_ids: [a!.id, b!.id],
      contacts: { contact_email: "concurrent@example.mk", contact_phone: "070 111 666" },
      credentials: { username: `concurrent-${Date.now()}`, password: "a-strong-password-1" },
    });
    const base = {
      couple_names: "Concurrent", event_date: "2099-12-12", start_time: null, end_time: null,
      status: "preparation" as const, event_type: "wedding" as const, guest_count_estimate: null, room_ids: [] as string[],
    };

    // Both windows started from the same [A, B] and never re-read between
    // dispatch and commit — exactly the gap the old read-then-recompute
    // approach raced on. Window 1 removes A; window 2 (unaware A is going)
    // adds C. Neither should be able to undo the other's effect.
    await Promise.all([
      updateEvent(event.id, venue!.id, { ...base, added_menu_ids: [], removed_menu_ids: [a!.id] }, admin),
      updateEvent(event.id, venue!.id, { ...base, added_menu_ids: [c!.id], removed_menu_ids: [] }, admin),
    ]);

    const { data: linked } = await admin.from("event_menu_templates").select("menu_template_id").eq("event_id", event.id);
    expect((linked ?? []).map((r) => r.menu_template_id).sort()).toEqual([b!.id, c!.id].sort());

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("refuses another venue's menu, and another event's custom menu", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Menu Refusal Venue" }).select().single();
    const { data: other } = await admin.from("venues").insert({ name: "Menu Refusal Other Venue" }).select().single();
    const { data: foreign } = await admin.from("menu_templates").insert({ venue_id: other!.id, name: "Туѓо" }).select().single();
    const event = await createEvent({
      venue_id: venue!.id,
      couple_names: "Refusal",
      event_date: "2099-12-06",
      room_ids: [],
      menu_template_ids: [],
      contacts: { contact_email: "r@example.mk", contact_phone: "070 111 333" },
      credentials: { username: `refusal-${Date.now()}`, password: "a-strong-password-1" },
    });
    const { data: otherEvent } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "Друг", event_date: "2099-12-07" }).select("id").single();
    const { data: someoneElsesCustom } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name: "Туѓо посебно", event_id: otherEvent!.id }).select().single();
    const MSG = "Едно или повеќе менија не припаѓаат на овој локал.";
    const base = {
      couple_names: "Refusal", event_date: "2099-12-06", start_time: null, end_time: null,
      status: "preparation" as const, event_type: "wedding" as const, guest_count_estimate: null, room_ids: [] as string[],
    };

    await expect(updateEvent(event.id, venue!.id, { ...base, added_menu_ids: [foreign!.id], removed_menu_ids: [] }, admin)).rejects.toThrow(MSG);
    await expect(updateEvent(event.id, venue!.id, { ...base, added_menu_ids: [someoneElsesCustom!.id], removed_menu_ids: [] }, admin)).rejects.toThrow(MSG);
    await expect(
      createEvent({
        venue_id: venue!.id, couple_names: "R2", event_date: "2099-12-08", room_ids: [],
        menu_template_ids: [someoneElsesCustom!.id],
        contacts: { contact_email: "r2@example.mk", contact_phone: "070 111 444" },
        credentials: { username: `refusal2-${Date.now()}`, password: "a-strong-password-1" },
      }),
    ).rejects.toThrow(MSG);

    await admin.from("venues").delete().in("id", [venue!.id, other!.id]);
  });

  it("rolls back the event row too when the rooms insert itself fails (final review finding: this specific step had no cleanup at all before — only the credentials step did)", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Create Event Atomic Rooms Venue" }).select().single();
    const bogusRoomId = "00000000-0000-4000-8000-000000000000"; // not a real row — event_rooms.room_id has a FK to rooms(id)

    // Calls the RPC directly, bypassing createEvent's own JS-side room
    // ownership check — the real-world case this covers is a room deleted
    // in the gap between that check and the write, not a client sending a
    // bogus id (which the JS check already refuses).
    const { error } = await admin.rpc("create_event_full", {
      p_venue_id: venue!.id,
      p_couple_names: "Rooms Rollback Couple",
      p_event_date: "2099-11-01",
      p_start_time: null,
      p_end_time: null,
      p_event_type: "wedding",
      p_status: "preparation",
      p_guest_count_estimate: null,
      p_menu_template_ids: [],
      p_room_ids: [bogusRoomId],
      p_contact_email: "rooms-rollback@example.mk",
      p_contact_email_2: null,
      p_contact_phone: "070 222 222",
      p_total_price: null,
      p_deposit_paid: null,
      p_username: `rooms-rollback-${Date.now()}`,
      p_password: "a-strong-password-1",
    });
    expect(error).not.toBeNull();

    const { data: orphaned } = await admin.from("events").select("id").eq("couple_names", "Rooms Rollback Couple");
    expect(orphaned).toEqual([]);

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});

describe("events data layer: updateEvent atomicity (final review finding)", () => {
  it("rolls back the event row's own changes too when the room diff fails — this had no transaction boundary at all before", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Update Event Atomic Rooms Venue" }).select().single();
    const event = await createEvent({
      venue_id: venue!.id,
      couple_names: "Original Name",
      event_date: "2099-11-02",
      room_ids: [],
      menu_template_ids: [],
      contacts: { contact_email: "update-atomic@example.mk", contact_phone: "070 333 333" },
      credentials: { username: `update-atomic-${Date.now()}`, password: "a-strong-password-1" },
    });
    const bogusRoomId = "00000000-0000-4000-8000-000000000001";

    // Direct RPC call, bypassing updateEvent's own JS-side room check — same
    // reasoning as the createEvent test above: covers a room removed in the
    // gap between that check and the write.
    const { error } = await admin.rpc("update_event_full", {
      p_event_id: event.id,
      p_venue_id: venue!.id,
      p_couple_names: "Changed Name",
      p_event_date: "2099-11-02",
      p_start_time: null,
      p_end_time: null,
      p_event_type: "wedding",
      p_status: "confirmed",
      p_guest_count_estimate: null,
      p_added_menu_ids: [],
      p_removed_menu_ids: [],
      p_room_ids: [bogusRoomId],
    });
    expect(error).not.toBeNull();

    // The event's own column change ("Changed Name") must not have stuck
    // either — same function, same transaction as the failed room insert.
    const { data: untouched } = await admin.from("events").select("couple_names").eq("id", event.id).single();
    expect(untouched!.couple_names).toBe("Original Name");

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});

describe("events data layer: getEventById", () => {
  it("fetches a single event by id", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Get Event Test Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({
        venue_id: venue!.id,
        couple_names: "Maja & Filip",
        event_date: "2026-12-01",
      })
      .select()
      .single();

    const found = await getEventById(event!.id);
    expect(found?.id).toBe(event!.id);
    expect(found?.venue_id).toBe(venue!.id);

    const missing = await getEventById("00000000-0000-0000-0000-000000000000");
    expect(missing).toBeNull();

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});

describe("events data layer: isVenueStaffForEvent", () => {
  const staffAEmail = "provision-staff-a@test.local";
  const staffBEmail = "provision-staff-b@test.local";
  const password = "test-password-123";

  let venueAId: string;
  let venueBId: string;
  let staffAUserId: string;
  let staffBUserId: string;
  let eventAId: string;

  beforeAll(async () => {
    const { data: venueA } = await admin.from("venues").insert({ name: "Provision Venue A" }).select().single();
    const { data: venueB } = await admin.from("venues").insert({ name: "Provision Venue B" }).select().single();
    venueAId = venueA!.id;
    venueBId = venueB!.id;

    const { data: userA } = await admin.auth.admin.createUser({
      email: staffAEmail,
      password,
      email_confirm: true,
    });
    staffAUserId = userA!.user!.id;
    await admin.from("venue_staff").insert({ user_id: staffAUserId, venue_id: venueAId });

    const { data: userB } = await admin.auth.admin.createUser({
      email: staffBEmail,
      password,
      email_confirm: true,
    });
    staffBUserId = userB!.user!.id;
    await admin.from("venue_staff").insert({ user_id: staffBUserId, venue_id: venueBId });

    const { data: event } = await admin
      .from("events")
      .insert({
        venue_id: venueAId,
        couple_names: "Provision Test Couple",
        event_date: "2026-11-01",
      })
      .select()
      .single();
    eventAId = event!.id;
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(staffAUserId);
    await admin.auth.admin.deleteUser(staffBUserId);
    await admin.from("venues").delete().in("id", [venueAId, venueBId]);
  });

  it("authorizes staff for their own venue's event", async () => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await client.auth.signInWithPassword({ email: staffAEmail, password });

    const authorized = await isVenueStaffForEvent(client, admin, eventAId);
    expect(authorized).toBe(true);
  });

  it("does not authorize staff from a different venue", async () => {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await client.auth.signInWithPassword({ email: staffBEmail, password });

    const authorized = await isVenueStaffForEvent(client, admin, eventAId);
    expect(authorized).toBe(false);
  });
});

describe("events data layer: updateEventContactInfo", () => {
  it("updates the event's contact fields", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Contact Info Test Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Contact & Test", event_date: "2099-09-30" })
      .select()
      .single();

    await updateEventContactInfo(event!.id, venue!.id, {
      contact_email: "couple@example.com",
      contact_email_2: null,
      contact_phone: "+389 70 111 222",
    });

    const { data: updated } = await admin
      .from("events")
      .select("contact_email, contact_email_2, contact_phone")
      .eq("id", event!.id)
      .single();
    expect(updated!.contact_email).toBe("couple@example.com");
    expect(updated!.contact_phone).toBe("+389 70 111 222");

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});

describe("events data layer: past-event write lock (security review fix)", () => {
  it("refuses updateEvent, updateEventContactInfo and updateEventFinance on a past event, but createEvent can still insert one", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Past Event Lock Venue" }).select().single();

    // Deliberately backdated at creation — a legitimate, still-allowed flow
    // (entering a historical booking for the record). Only *editing* an
    // existing event after the fact is locked once its date is in the past.
    const event = await createEvent({
      venue_id: venue!.id,
      couple_names: "Past Couple",
      event_date: "2000-01-01",
      room_ids: [],
      menu_template_ids: [],
      contacts: { contact_email: "past@example.mk", contact_phone: "070 000 000" },
      credentials: { username: `past-couple-${Date.now()}`, password: "a-strong-password-1" },
      total_price: 500,
      deposit_paid: 100,
    });
    const { data: created } = await admin.from("events").select("event_date, total_price").eq("id", event.id).single();
    expect(created).toEqual({ event_date: "2000-01-01", total_price: 500 });

    await expect(
      updateEvent(event.id, venue!.id, {
        couple_names: "Past Couple",
        event_date: "2000-01-01",
        start_time: null,
        end_time: null,
        status: "confirmed",
        event_type: "wedding",
        guest_count_estimate: null,
        room_ids: [],
        added_menu_ids: [],
        removed_menu_ids: [],
      }),
    ).rejects.toThrow(PastEventError);

    await expect(
      updateEventContactInfo(event.id, venue!.id, {
        contact_email: "new@example.mk",
        contact_email_2: null,
        contact_phone: "070 111 111",
      }),
    ).rejects.toThrow(PastEventError);

    await expect(updateEventFinance(event.id, venue!.id, { total_price: 999, deposit_paid: null })).rejects.toThrow(PastEventError);

    // Untouched by any of the rejected attempts.
    const { data: untouched } = await admin.from("events").select("contact_email, total_price").eq("id", event.id).single();
    expect(untouched).toEqual({ contact_email: "past@example.mk", total_price: 500 });

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("still allows all three for an event happening today", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Today Event Lock Venue" }).select().single();
    const event = await createEvent({
      venue_id: venue!.id,
      couple_names: "Today Couple",
      event_date: todayIn(),
      room_ids: [],
      menu_template_ids: [],
      contacts: { contact_email: "today@example.mk", contact_phone: "070 000 000" },
      credentials: { username: `today-couple-${Date.now()}`, password: "a-strong-password-1" },
    });

    await expect(
      updateEventContactInfo(event.id, venue!.id, { contact_email: "updated@example.mk", contact_email_2: null, contact_phone: "070 222 222" }),
    ).resolves.toBeUndefined();
    await expect(updateEventFinance(event.id, venue!.id, { total_price: 1000, deposit_paid: 200 })).resolves.toBeUndefined();

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
