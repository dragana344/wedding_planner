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
    expect(events[0].customMenuItems).toEqual([]);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("surfaces a couple's custom menu selection (no template) so staff can see it", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Custom Menu Visibility Test Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Custom Menu Couple", event_date: "2026-09-21" })
      .select()
      .single();
    const { data: chicken } = await admin
      .from("menu_items")
      .insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "Roast Chicken" })
      .select()
      .single();
    const { data: cake } = await admin
      .from("menu_items")
      .insert({ venue_id: venue!.id, tiers: ["special"], course: "dessert", name: "Birthday Cake" })
      .select()
      .single();
    await admin
      .from("event_custom_menu_items")
      .insert([
        { event_id: event!.id, menu_item_id: chicken!.id },
        { event_id: event!.id, menu_item_id: cake!.id },
      ]);

    const events = await listEventsWithDetails(venue!.id, admin);
    expect(events).toHaveLength(1);
    expect(events[0].menu_template_id).toBeNull();
    expect(events[0].customMenuItems.map((i) => i.name).sort()).toEqual(["Birthday Cake", "Roast Chicken"]);

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
      menu_template_id: template!.id,
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
        menu_template_id: null,
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
      menu_template_id: null,
      contacts: { contact_email: "first@example.mk", contact_phone: "070 000 000" },
      credentials: { username: takenUsername, password: "a-strong-password-1" },
    });
    await expect(
      createEvent({
        venue_id: venue!.id,
        couple_names: "Collides On Username",
        event_date: "2026-10-04",
        room_ids: [],
        menu_template_id: null,
        contacts: { contact_email: "second@example.mk", contact_phone: "070 111 111" },
        credentials: { username: takenUsername, password: "a-strong-password-1" },
      }),
      // create_event_credentials only maps a friendly Macedonian message for
      // a collision with a co-organizer's username — a collision with
      // another couple's own username surfaces the table's raw unique-
      // constraint error instead (a pre-existing RPC quirk, not this fix's
      // concern; rollback-on-failure is what this test is actually checking).
    ).rejects.toThrow("duplicate key value violates unique constraint");
    const { data: orphaned } = await admin.from("events").select("id").eq("couple_names", "Collides On Username");
    expect(orphaned).toEqual([]);

    await expect(updateEventContactInfo(event.id, venue!.id, { contact_email: "ivana@example.mk", contact_email_2: null, contact_phone: "" })).rejects.toThrow(
      "Внесете телефон на парот.",
    );

    await admin.from("venues").delete().eq("id", venue!.id);
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
      p_menu_template_id: null,
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
      menu_template_id: null,
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
      p_menu_template_id: null,
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
      menu_template_id: null,
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
        menu_template_id: null,
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
      menu_template_id: null,
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
