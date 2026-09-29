// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listEvents, createEvent, isVenueStaffForEvent, getEventById, listEventsWithDetails, updateEventContactInfo } from "@/lib/venue/events";

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
      event_date: "2026-10-01",
      room_ids: [room!.id],
      menu_template_id: template!.id,
      contacts: { contact_email: "ivana@example.mk", contact_phone: "070 123 456" },
    });

    const { data: linkedRooms } = await admin.from("event_rooms").select("room_id").eq("event_id", event.id);
    expect(linkedRooms).toHaveLength(1);
    expect(linkedRooms![0].room_id).toBe(room!.id);
    // A21: the couple's contacts are saved with the event itself.
    const { data: saved } = await admin.from("events").select("contact_email, contact_email_2, contact_phone").eq("id", event.id).single();
    expect(saved).toEqual({ contact_email: "ivana@example.mk", contact_email_2: null, contact_phone: "070 123 456" });

    await expect(
      createEvent({
        venue_id: venue!.id,
        couple_names: "No Contacts",
        event_date: "2026-10-02",
        room_ids: [],
        menu_template_id: null,
        contacts: { contact_email: "", contact_phone: "070 123 456" },
      }),
    ).rejects.toThrow("Внесете email на парот.");
    const { data: none } = await admin.from("events").select("id").eq("couple_names", "No Contacts");
    expect(none).toEqual([]);

    await expect(updateEventContactInfo(event.id, { contact_email: "ivana@example.mk", contact_email_2: null, contact_phone: "" })).rejects.toThrow(
      "Внесете телефон на парот.",
    );

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
      .insert({ venue_id: venue!.id, couple_names: "Contact & Test", event_date: "2026-09-30" })
      .select()
      .single();

    await updateEventContactInfo(event!.id, {
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
