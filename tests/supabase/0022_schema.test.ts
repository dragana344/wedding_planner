import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("0022 schema: organizer tools", () => {
  it("creates an agenda item, a location, a guest, a menu item quantity, and an invitation", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "0022 Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "0022 Couple", event_date: "2027-01-01" })
      .select()
      .single();

    const { data: agendaItem, error: agendaError } = await admin
      .from("event_agenda_items")
      .insert({ event_id: event!.id, time: "16:00", title: "Собирање гости", sort_order: 0 })
      .select()
      .single();
    expect(agendaError).toBeNull();
    expect(agendaItem!.title).toBe("Собирање гости");

    const { data: location, error: locationError } = await admin
      .from("event_locations")
      .insert({ event_id: event!.id, label: "Црква", address: "Ул. Св. Петка", sort_order: 0 })
      .select()
      .single();
    expect(locationError).toBeNull();
    expect(location!.label).toBe("Црква");

    const { data: guest, error: guestError } = await admin
      .from("event_guests")
      .insert({ event_id: event!.id, full_name: "Петре Петров", party_size: 2 })
      .select()
      .single();
    expect(guestError).toBeNull();
    expect(guest!.rsvp_status).toBe("pending");

    const { error: badStatusError } = await admin
      .from("event_guests")
      .insert({ event_id: event!.id, full_name: "Bad Status", rsvp_status: "not-a-real-status" });
    expect(badStatusError).not.toBeNull();

    const { data: menuItem } = await admin
      .from("menu_items")
      .insert({ venue_id: venue!.id, tiers: ["special"], course: "main", name: "Печено пиле" })
      .select()
      .single();

    const { error: quantityError } = await admin
      .from("event_menu_item_quantities")
      .insert({ event_id: event!.id, menu_item_id: menuItem!.id, guest_count: 5 });
    expect(quantityError).toBeNull();

    const { data: invitation, error: invitationError } = await admin
      .from("event_invitations")
      .insert({ event_id: event!.id, template_id: "romantic-floral", public_slug: "0022-test-slug" })
      .select()
      .single();
    expect(invitationError).toBeNull();
    expect(invitation!.public_slug).toBe("0022-test-slug");

    // one invitation per event
    const { error: duplicateError } = await admin
      .from("event_invitations")
      .insert({ event_id: event!.id, template_id: "elegant-gold", public_slug: "another-slug" });
    expect(duplicateError).not.toBeNull();

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("cascades deletes from events to all five new tables", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "0022 Cascade Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Cascade Couple", event_date: "2027-01-02" })
      .select()
      .single();
    await admin.from("event_agenda_items").insert({ event_id: event!.id, title: "Test", sort_order: 0 });
    await admin.from("event_locations").insert({ event_id: event!.id, label: "Test", sort_order: 0 });
    await admin.from("event_guests").insert({ event_id: event!.id, full_name: "Test" });
    await admin.from("event_invitations").insert({ event_id: event!.id, template_id: "romantic-floral", public_slug: "cascade-slug" });

    await admin.from("events").delete().eq("id", event!.id);

    const { data: agendaItems } = await admin.from("event_agenda_items").select("id").eq("event_id", event!.id);
    const { data: locations } = await admin.from("event_locations").select("id").eq("event_id", event!.id);
    const { data: guests } = await admin.from("event_guests").select("id").eq("event_id", event!.id);
    const { data: invitations } = await admin.from("event_invitations").select("event_id").eq("event_id", event!.id);
    expect(agendaItems).toHaveLength(0);
    expect(locations).toHaveLength(0);
    expect(guests).toHaveLength(0);
    expect(invitations).toHaveLength(0);

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
