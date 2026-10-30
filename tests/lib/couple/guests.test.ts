// @vitest-environment node
import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { listGuests, addGuest, updateGuest, updateGuestStatus, updateGuestSide, deleteGuest, getGuestStats, getGuestSeat, importGuests, setGuestMenuCounts } from "@/lib/couple/guests";
import { isGuestDone } from "@/lib/couple/guest-menus";
import { guestsToCsv } from "@/lib/couple/guest-csv";
import * as guestRoute from "@/app/api/couple/guests/[id]/route";

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
    expect(listed[0]).toMatchObject({ email: "ana@example.mk", children_count: 0, menu_counts: {}, allergies: null, rsvp_comment: null, invitation_sent_at: null, invitation_channel: null });
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

  async function eventWithMenus(venueName: string, menuNames: string[]) {
    const { data: venue } = await admin.from("venues").insert({ name: venueName }).select().single();
    const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "M", event_date: "2027-04-04" }).select().single();
    const ids: string[] = [];
    for (const name of menuNames) {
      const { data: t } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name }).select().single();
      await admin.from("event_menu_templates").insert({ event_id: event!.id, menu_template_id: t!.id });
      ids.push(t!.id);
    }
    return { venueId: venue!.id as string, eventId: event!.id as string, ids };
  }

  async function patch(eventId: string, guestId: string, body: unknown, side?: "bride" | "groom") {
    const headers: Record<string, string> = { "x-couple-event-id": eventId, "content-type": "application/json" };
    if (side) headers["x-couple-organizer-side"] = side;
    const res = await guestRoute.PATCH(
      new NextRequest(`http://localhost/api/couple/guests/${guestId}`, { method: "PATCH", headers, body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: guestId }) },
    );
    return { status: res.status, json: await res.json() };
  }

  it("stats totals per menu and lists not-done guests by name", async () => {
    const { venueId, eventId, ids } = await eventWithMenus("Guests Summary Venue", ["Класично", "Посно"]);
    const [classic, posno] = ids;
    await admin.from("event_guests").insert([
      { event_id: eventId, full_name: "A", rsvp_status: "confirmed", party_size: 4, children_count: 1, invitation_sent_at: "2027-01-01T10:00:00Z", invitation_channel: "viber" },
      { event_id: eventId, full_name: "B", rsvp_status: "confirmed", party_size: 2, invitation_sent_at: "2027-01-01T10:00:00Z", invitation_channel: "link" },
      { event_id: eventId, full_name: "C", rsvp_status: "confirmed", party_size: 1 },
      { event_id: eventId, full_name: "D", rsvp_status: "declined", party_size: 1 },
      { event_id: eventId, full_name: "Б-покана", rsvp_status: "invited", party_size: 1 },
    ], { defaultToNull: false });
    const guests = await listGuests(eventId);
    const byName = (n: string) => guests.find((g) => g.full_name === n)!;
    await setGuestMenuCounts(eventId, byName("A").id, { [classic]: 3, [posno]: 1 });
    await setGuestMenuCounts(eventId, byName("B").id, { [posno]: 2 });

    // C has a stale partial choice: confirmed but not done, so excluded from totals.
    await admin.from("event_guest_menu_counts").insert({ guest_id: byName("C").id, menu_template_id: classic, count: 1 });
    await admin.from("event_guests").update({ party_size: 3 }).eq("id", byName("C").id);

    const stats = await getGuestStats(eventId);
    expect(stats).toMatchObject({ total: 5, confirmed: 3, totalAttending: 9, childrenAttending: 1, invitationsSent: 2 });
    expect(stats.menus).toEqual([
      { id: classic, name: "Класично", count: 3 },
      { id: posno, name: "Посно", count: 3 },
    ]);
    // C confirmed without counts, and the invited guest; A and B are done, D declined.
    expect(stats.notDone.map((g) => g.full_name)).toEqual(["Б-покана", "C"]);

    await admin.from("venues").delete().eq("id", venueId);
  });

  it("a status change for another event's guest leaves that guest untouched", async () => {
    const a = await eventWithMenus("Guests Cross A", ["Класично", "Посно"]);
    const b = await eventWithMenus("Guests Cross B", ["Класично", "Посно"]);
    const guest = await addGuest(b.eventId, { full_name: "Туѓ", phone: null, party_size: 2, notes: null, side: null });
    await updateGuestStatus(b.eventId, guest.id, "confirmed");
    await setGuestMenuCounts(b.eventId, guest.id, { [b.ids[0]]: 2 });

    await expect(updateGuestStatus(a.eventId, guest.id, "declined")).rejects.toThrow("Гостинот не е пронајден.");
    const res = await patch(a.eventId, guest.id, { type: "status", rsvp_status: "declined" });
    expect(res.status).toBe(400);
    const [after] = await listGuests(b.eventId);
    expect(after.rsvp_status).toBe("confirmed");
    expect(after.menu_counts).toEqual({ [b.ids[0]]: 2 });
    await admin.from("venues").delete().eq("id", a.venueId);
    await admin.from("venues").delete().eq("id", b.venueId);
  });

  it("with one menu every confirmed guest's party counts toward it", async () => {
    const { venueId, eventId, ids } = await eventWithMenus("Guests One Menu Venue", ["Единствено"]);
    await admin.from("event_guests").insert([
      { event_id: eventId, full_name: "A", rsvp_status: "confirmed", party_size: 3 },
      { event_id: eventId, full_name: "D", rsvp_status: "declined", party_size: 2 },
    ], { defaultToNull: false });
    const stats = await getGuestStats(eventId);
    expect(stats.menus).toEqual([{ id: ids[0], name: "Единствено", count: 3 }]);
    expect(stats.notDone).toEqual([]);

    // CSV: one column per menu, the party size for confirmed guests.
    const csv = guestsToCsv(await listGuests(eventId), stats.menus);
    expect(csv).toContain("Единствено");
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("guest whose party size changed is not done", async () => {
    const { venueId, eventId, ids } = await eventWithMenus("Guests Party Venue", ["Класично", "Посно"]);
    const guest = await addGuest(eventId, { full_name: "Ана", phone: null, party_size: 2, notes: null, side: null });
    await updateGuestStatus(eventId, guest.id, "confirmed");
    await setGuestMenuCounts(eventId, guest.id, { [ids[0]]: 1, [ids[1]]: 1 });
    let [g] = await listGuests(eventId);
    expect(g.menu_counts).toEqual({ [ids[0]]: 1, [ids[1]]: 1 });
    expect(isGuestDone(g, ids)).toBe(true);

    g = await updateGuest(eventId, guest.id, { full_name: "Ана", phone: null, party_size: 3, notes: null, side: null });
    expect(isGuestDone(g, ids)).toBe(false);
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("adding a second menu makes earlier confirmations not done", async () => {
    const { venueId, eventId, ids } = await eventWithMenus("Guests Second Menu Venue", ["Класично"]);
    const guest = await addGuest(eventId, { full_name: "Ана", phone: null, party_size: 2, notes: null, side: null });
    await updateGuestStatus(eventId, guest.id, "confirmed");
    expect(isGuestDone((await listGuests(eventId))[0], ids)).toBe(true);

    const { data: t } = await admin.from("menu_templates").insert({ venue_id: venueId, name: "Посно" }).select().single();
    await admin.from("event_menu_templates").insert({ event_id: eventId, menu_template_id: t!.id });
    expect(isGuestDone((await listGuests(eventId))[0], [...ids, t!.id])).toBe(false);
    expect((await getGuestStats(eventId)).notDone.map((g) => g.full_name)).toEqual(["Ана"]);
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("declined guests are done and never counted", async () => {
    const { venueId, eventId, ids } = await eventWithMenus("Guests Declined Venue", ["Класично", "Посно"]);
    const guest = await addGuest(eventId, { full_name: "Ана", phone: null, party_size: 2, notes: null, side: null });
    await updateGuestStatus(eventId, guest.id, "confirmed");
    await setGuestMenuCounts(eventId, guest.id, { [ids[0]]: 2 });
    expect((await getGuestStats(eventId)).menus.map((m) => m.count)).toEqual([2, 0]);

    const declined = await updateGuestStatus(eventId, guest.id, "declined");
    expect(declined.menu_counts).toEqual({});
    expect(isGuestDone(declined, ids)).toBe(true);
    const stats = await getGuestStats(eventId);
    expect(stats.menus.map((m) => m.count)).toEqual([0, 0]);
    expect(stats.notDone).toEqual([]);
    const { data: rows } = await admin.from("event_guest_menu_counts").select("guest_id").eq("guest_id", guest.id);
    expect(rows).toEqual([]);
    await admin.from("venues").delete().eq("id", venueId);
  });

  it("couple sets a guest's counts; wrong sum is a 400 with the Macedonian message; co-organizer limited to own side", async () => {
    const { venueId, eventId, ids } = await eventWithMenus("Guests Route Venue", ["Класично", "Посно"]);
    const mine = await addGuest(eventId, { full_name: "Моја", phone: null, party_size: 4, notes: null, side: "bride" });
    const theirs = await addGuest(eventId, { full_name: "Нивна", phone: null, party_size: 2, notes: null, side: "groom" });
    await updateGuestStatus(eventId, mine.id, "confirmed");
    await updateGuestStatus(eventId, theirs.id, "confirmed");

    const ok = await patch(eventId, mine.id, { type: "menus", counts: { [ids[0]]: 3, [ids[1]]: 1 } });
    expect(ok.status).toBe(200);
    expect(ok.json.menu_counts).toEqual({ [ids[0]]: 3, [ids[1]]: 1 });

    const wrong = await patch(eventId, mine.id, { type: "menus", counts: { [ids[0]]: 1 } });
    expect(wrong).toEqual({ status: 400, json: { error: "Изберете мени за сите 4 лица." } });
    // A refused save changes nothing.
    expect((await listGuests(eventId)).find((g) => g.id === mine.id)!.menu_counts).toEqual({ [ids[0]]: 3, [ids[1]]: 1 });

    const other = await patch(eventId, theirs.id, { type: "menus", counts: { [ids[0]]: 2 } }, "bride");
    expect(other.status).toBe(400);
    expect(other.json.error).toMatch(/само гости од вашата страна/);
    const own = await patch(eventId, mine.id, { type: "menus", counts: { [ids[1]]: 4 } }, "bride");
    expect(own.status).toBe(200);

    const pending = await addGuest(eventId, { full_name: "Не", phone: null, party_size: 1, notes: null, side: "bride" });
    expect(await patch(eventId, pending.id, { type: "menus", counts: { [ids[0]]: 1 } })).toEqual({
      status: 400,
      json: { error: "Гостинот не е потврден." },
    });
    await admin.from("venues").delete().eq("id", venueId);
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
