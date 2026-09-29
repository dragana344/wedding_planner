// @vitest-environment node
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { listGuests, addGuest, updateGuest, updateGuestStatus, updateGuestSide, deleteGuest, getGuestStats, getGuestSeat, importGuests } from "@/lib/couple/guests";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe("lib/couple/guests", () => {
  it("adds, lists, updates details, updates status, computes stats, and deletes", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Guests Test Venue" }).select().single();
    const { data: event } = await admin
      .from("events")
      .insert({ venue_id: venue!.id, couple_names: "Guests Couple", event_date: "2027-04-01" })
      .select()
      .single();

    const a = await addGuest(event!.id, { full_name: "Ана Петровска", phone: "070111222", email: "ana@example.mk", party_size: 2, notes: null, side: "bride" });
    const b = await addGuest(event!.id, { full_name: "Марко Стојановски", phone: null, party_size: 1, notes: "алергија на јаткасти плодови", side: "groom" });
    expect(a.rsvp_status).toBe("pending");
    expect(a.side).toBe("bride");

    const listed = await listGuests(event!.id);
    expect(listed).toHaveLength(2);
    // Everything the couple's list and detail panel show (A7).
    expect(listed[0]).toMatchObject({ email: "ana@example.mk", children_count: 0, menu_choice: null, allergies: null, rsvp_comment: null, invitation_sent_at: null, invitation_channel: null });
    expect(listed[0].invite_token).toMatch(/^[A-Za-z0-9_-]{22,}$/);

    const updated = await updateGuest(event!.id, a.id, { full_name: "Ана Петровска-Илиевска", phone: a.phone, party_size: 3, notes: null, side: "bride" });
    expect(updated.party_size).toBe(3);

    const movedToGroom = await updateGuestSide(event!.id, a.id, "groom");
    expect(movedToGroom.side).toBe("groom");

    await updateGuestStatus(event!.id, a.id, "confirmed");
    await updateGuestStatus(event!.id, b.id, "declined");

    const stats = await getGuestStats(event!.id);
    expect(stats).toMatchObject({ total: 2, confirmed: 1, declined: 1, pending: 0, invited: 0, later: 0, totalAttending: 3 });

    await deleteGuest(event!.id, b.id);
    expect(await listGuests(event!.id)).toHaveLength(1);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("summarises menus, children and sent invitations for the couple (A4, A8, A17)", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Guests Summary Venue" }).select().single();
    const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "S", event_date: "2027-04-04" }).select().single();
    await admin.from("event_guests").insert([
      { event_id: event!.id, full_name: "A", rsvp_status: "confirmed", party_size: 3, children_count: 1, menu_choice: "posno", invitation_sent_at: "2027-01-01T10:00:00Z", invitation_channel: "viber" },
      { event_id: event!.id, full_name: "B", rsvp_status: "confirmed", party_size: 2, menu_choice: "standard", invitation_sent_at: "2027-01-01T10:00:00Z", invitation_channel: "link" },
      { event_id: event!.id, full_name: "C", rsvp_status: "confirmed", party_size: 1 },
      // A declined guest's old menu choice does not count toward the kitchen.
      { event_id: event!.id, full_name: "D", rsvp_status: "declined", party_size: 1, menu_choice: "vegetarian" },
    ], { defaultToNull: false });

    expect(await getGuestStats(event!.id)).toMatchObject({
      total: 4,
      confirmed: 3,
      totalAttending: 6,
      childrenAttending: 1,
      menu: { standard: 2, posno: 3, vegetarian: 0, unset: 1 },
      invitationsSent: 2,
    });

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("reads a guest's table and seat when seating provides it, and nothing for another event's guest", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Guests Seat Venue" }).select().single();
    const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "T", event_date: "2027-04-05" }).select().single();
    const guest = await addGuest(event!.id, { full_name: "Без маса", phone: null, party_size: 1, notes: null, side: null });

    expect(await getGuestSeat(event!.id, guest.id)).toBeNull();
    await expect(getGuestSeat(randomUUID(), guest.id)).resolves.toBeNull();

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("counts guests who will answer later (A2)", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Guests Later Venue" }).select().single();
    const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "L", event_date: "2027-04-03" }).select().single();
    const guest = await addGuest(event!.id, { full_name: "Подоцна", phone: null, party_size: 2, notes: null, side: null });

    expect((await updateGuestStatus(event!.id, guest.id, "later")).rsvp_status).toBe("later");
    expect(await getGuestStats(event!.id)).toMatchObject({ total: 1, later: 1, totalAttending: 0 });

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("rejects an invalid rsvp_status at the database level", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Guests Invalid Status Venue" }).select().single();
    const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "C", event_date: "2027-04-02" }).select().single();
    const guest = await addGuest(event!.id, { full_name: "Test", phone: null, party_size: 1, notes: null, side: null });

    await expect(updateGuestStatus(event!.id, guest.id, "not-a-real-status" as never)).rejects.toThrow();

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("rejects an invalid side at the database level", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Guests Invalid Side Venue" }).select().single();
    const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "C", event_date: "2027-04-05" }).select().single();
    const guest = await addGuest(event!.id, { full_name: "Test", phone: null, party_size: 1, notes: null, side: null });

    await expect(updateGuestSide(event!.id, guest.id, "not-a-real-side" as never)).rejects.toThrow();

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("refuses to update or delete a guest belonging to a different event", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Guests Scope Venue" }).select().single();
    const { data: eventA } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "A", event_date: "2027-04-03" }).select().single();
    const { data: eventB } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "B", event_date: "2027-04-04" }).select().single();

    const guest = await addGuest(eventA!.id, { full_name: "A's guest", phone: null, party_size: 1, notes: null, side: null });
    await expect(updateGuest(eventB!.id, guest.id, { full_name: "hijacked", phone: null, party_size: 1, notes: null, side: null })).rejects.toThrow();
    await expect(updateGuestSide(eventB!.id, guest.id, "bride")).rejects.toThrow();
    await deleteGuest(eventB!.id, guest.id);
    expect(await listGuests(eventA!.id)).toHaveLength(1);

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("imports CSV rows, skipping names already on the list (A20)", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Guests Import Venue" }).select().single();
    const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "I", event_date: "2027-04-06" }).select().single();
    await addGuest(event!.id, { full_name: "Ана Петровска", phone: null, party_size: 1, notes: null, side: null });

    const result = await importGuests(event!.id, [
      { full_name: "ана петровска ", phone: "070", email: null, side: "bride", party_size: 2 },
      { full_name: "Марко", phone: null, email: "marko@example.mk", side: "groom", party_size: 3 },
      { full_name: "Марко", phone: null, email: null, side: null, party_size: 1 },
    ]);
    expect(result).toEqual({ imported: 1, skipped: 2 });

    const guests = await listGuests(event!.id);
    expect(guests.map((g) => g.full_name)).toEqual(["Ана Петровска", "Марко"]);
    expect(guests[1]).toMatchObject({ email: "marko@example.mk", side: "groom", party_size: 3, rsvp_status: "pending" });

    await admin.from("venues").delete().eq("id", venue!.id);
  });

  it("refuses an import that would exceed the guest list limit", async () => {
    const { data: venue } = await admin.from("venues").insert({ name: "Guests Import Limit Venue" }).select().single();
    const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "IL", event_date: "2027-04-07" }).select().single();
    const rows = Array.from({ length: 1001 }, (_, i) => ({ full_name: `Гостин ${i}`, phone: null, email: null, side: null, party_size: 1 }));

    await expect(importGuests(event!.id, rows)).rejects.toThrow("Листата може да има најмногу 1000 гости.");
    expect(await listGuests(event!.id)).toHaveLength(0);

    await admin.from("venues").delete().eq("id", venue!.id);
  });
});
