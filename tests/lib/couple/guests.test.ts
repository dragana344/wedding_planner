// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listGuests, addGuest, updateGuest, updateGuestStatus, updateGuestSide, deleteGuest, getGuestStats } from "@/lib/couple/guests";

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

    const a = await addGuest(event!.id, { full_name: "Ана Петровска", phone: "070111222", party_size: 2, notes: null, side: "bride" });
    const b = await addGuest(event!.id, { full_name: "Марко Стојановски", phone: null, party_size: 1, notes: "алергија на јаткасти плодови", side: "groom" });
    expect(a.rsvp_status).toBe("pending");
    expect(a.side).toBe("bride");

    const listed = await listGuests(event!.id);
    expect(listed).toHaveLength(2);

    const updated = await updateGuest(event!.id, a.id, { full_name: "Ана Петровска-Илиевска", phone: a.phone, party_size: 3, notes: null, side: "bride" });
    expect(updated.party_size).toBe(3);

    const movedToGroom = await updateGuestSide(event!.id, a.id, "groom");
    expect(movedToGroom.side).toBe("groom");

    await updateGuestStatus(event!.id, a.id, "confirmed");
    await updateGuestStatus(event!.id, b.id, "declined");

    const stats = await getGuestStats(event!.id);
    expect(stats).toEqual({ total: 2, confirmed: 1, declined: 1, pending: 0, invited: 0, totalAttending: 3 });

    await deleteGuest(event!.id, b.id);
    expect(await listGuests(event!.id)).toHaveLength(1);

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
});
