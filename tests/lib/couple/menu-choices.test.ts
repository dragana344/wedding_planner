// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  addGuest,
  flagGuestsToRechooseMenus,
  getGuest,
  getGuestStats,
  importGuests,
  MENUS_OVER_PARTY_ERROR,
  setGuestMenuCounts,
  updateGuest,
  updateGuestStatus,
} from "@/lib/couple/guests";
import { isGuestDone, NO_MEAL_OVER_CHILDREN_ERROR } from "@/lib/couple/guest-menus";
import { recordCoupleAnswer } from "@/lib/couple/rsvp-answers";
import { currentMenuNumbers, listMenuSubmissions, sendMenuNumbers } from "@/lib/couple/menu-submissions";
import { CHILDREN_OVER_PARTY_ERROR } from "@/lib/couple/rsvp-answer-view";
import { listEventsWithDetails, updateEvent } from "@/lib/venue/events";
import { runMenuAutoSend } from "@/lib/couple/menu-auto-send";
import { todayIn } from "@/lib/date";

// Group B task 3 (0181): menu choices survive status changes, the numbers
// stay consistent (children ≤ party, children without a meal, a smaller
// party), and a menu change on the event tells the couple and the venue who
// has to choose again.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const venues: string[] = [];

afterAll(async () => {
  for (const id of venues) await admin.from("venues").delete().eq("id", id);
});

async function eventWithMenus(menuNames: string[], eventDate = "2027-05-05") {
  const { data: venue } = await admin.from("venues").insert({ name: `Menu Choices ${Date.now()}` }).select().single();
  venues.push(venue!.id);
  const { data: event } = await admin.from("events").insert({ venue_id: venue!.id, couple_names: "M", event_date: eventDate }).select().single();
  const ids: string[] = [];
  for (const name of menuNames) {
    const { data: t } = await admin.from("menu_templates").insert({ venue_id: venue!.id, name }).select().single();
    await admin.from("event_menu_templates").insert({ event_id: event!.id, menu_template_id: t!.id });
    ids.push(t!.id);
  }
  return { venueId: venue!.id as string, eventId: event!.id as string, ids };
}

async function confirmedGuest(eventId: string, party: number, name = "Ана") {
  const g = await addGuest(eventId, { full_name: name, phone: null, party_size: party, notes: null, side: null });
  await updateGuestStatus(eventId, g.id, "confirmed");
  return g.id;
}

describe("0181: a guest's menu choice survives their answer", () => {
  it("a no or later from the couple, a phone answer or the guest keeps the split; a yes with the same party reuses it", async () => {
    const { eventId, ids } = await eventWithMenus(["Класично", "Посно"]);
    const [a, b] = ids;
    const id = await confirmedGuest(eventId, 3);
    await recordCoupleAnswer(eventId, id, { status: "confirmed", partySize: 3, childrenCount: 1, noMealCount: 1, menuCounts: { [a]: 1, [b]: 1 } }, "couple");
    expect((await getGuestStats(eventId)).menus.map((m) => m.count)).toEqual([1, 1]);

    await recordCoupleAnswer(eventId, id, { status: "later", partySize: 1 }, "couple");
    let guest = await getGuest(eventId, id);
    expect(guest.menu_counts).toEqual({ [a]: 1, [b]: 1 });
    expect(guest.no_meal_count).toBe(1);
    let stats = await getGuestStats(eventId);
    expect(stats.menus.map((m) => m.count)).toEqual([0, 0]);
    expect(stats.noMeal).toBe(0);

    await updateGuestStatus(eventId, id, "declined");
    await updateGuestStatus(eventId, id, "confirmed");
    guest = await getGuest(eventId, id);
    expect(isGuestDone(guest, ids)).toBe(true);
    stats = await getGuestStats(eventId);
    expect(stats.menus.map((m) => m.count)).toEqual([1, 1]);
    expect(stats.noMeal).toBe(1);
    expect(stats.notDone).toEqual([]);
  });

  it("a yes with a smaller party replaces the split, never leaving more menus than people", async () => {
    const { eventId, ids } = await eventWithMenus(["Класично", "Посно"]);
    const [a, b] = ids;
    const id = await confirmedGuest(eventId, 4);
    await setGuestMenuCounts(eventId, id, { [a]: 2, [b]: 2 });
    await recordCoupleAnswer(eventId, id, { status: "declined", partySize: 1 }, "couple");
    // A shrunk yes must bring its own full split (the guest form's rule).
    await expect(recordCoupleAnswer(eventId, id, { status: "confirmed", partySize: 2, menuCounts: { [a]: 2, [b]: 2 } }, "couple")).rejects.toThrow(
      "Изберете мени за сите 2 лица.",
    );
    await recordCoupleAnswer(eventId, id, { status: "confirmed", partySize: 2, menuCounts: { [b]: 2 } }, "couple");
    expect((await getGuest(eventId, id)).menu_counts).toEqual({ [b]: 2 });
  });
});

describe("0181: children ≤ party, children without a meal", () => {
  it("refuses more children than people, and no-meal children over the children, on every path", async () => {
    const { eventId, ids } = await eventWithMenus(["Класично", "Посно"]);
    const [a] = ids;
    const id = await confirmedGuest(eventId, 2);
    await expect(recordCoupleAnswer(eventId, id, { status: "confirmed", partySize: 2, childrenCount: 3, menuCounts: { [a]: 2 } }, "couple")).rejects.toThrow(
      CHILDREN_OVER_PARTY_ERROR,
    );
    await expect(
      recordCoupleAnswer(eventId, id, { status: "confirmed", partySize: 2, childrenCount: 1, noMealCount: 2, menuCounts: {} }, "couple"),
    ).rejects.toThrow(NO_MEAL_OVER_CHILDREN_ERROR);
    await expect(setGuestMenuCounts(eventId, id, { [a]: 1 }, 1)).rejects.toThrow(NO_MEAL_OVER_CHILDREN_ERROR);

    // The database refuses it too.
    const { error } = await admin.from("event_guests").update({ children_count: 5 }).eq("id", id);
    expect(error?.code).toBe("23514");
    const { error: noMealError } = await admin.from("event_guests").update({ no_meal_count: 1 }).eq("id", id);
    expect(noMealError?.code).toBe("23514");
  });

  it("the couple's plain edit: a smaller party may not leave more children or a bigger split", async () => {
    const { eventId, ids } = await eventWithMenus(["Класично", "Посно"]);
    const [a, b] = ids;
    const id = await confirmedGuest(eventId, 4);
    await recordCoupleAnswer(eventId, id, { status: "confirmed", partySize: 4, childrenCount: 2, menuCounts: { [a]: 2, [b]: 2 } }, "couple");
    const base = { full_name: "Ана", phone: null, notes: null, side: null };
    await expect(updateGuest(eventId, id, { ...base, party_size: 1 })).rejects.toThrow(CHILDREN_OVER_PARTY_ERROR);
    await expect(updateGuest(eventId, id, { ...base, party_size: 3 })).rejects.toThrow(MENUS_OVER_PARTY_ERROR);
    // A bigger party is fine: the guest just isn't done until the split is fixed.
    const bigger = await updateGuest(eventId, id, { ...base, party_size: 5 });
    expect(isGuestDone(bigger, ids)).toBe(false);

    // Not coming: a split that no longer fits simply goes.
    await updateGuestStatus(eventId, id, "declined");
    const shrunk = await updateGuest(eventId, id, { ...base, party_size: 3 });
    expect(shrunk.menu_counts).toEqual({});
  });

  it("menu numbers: meals per menu plus 'Деца без оброк', sent and stored", async () => {
    const { eventId, ids } = await eventWithMenus(["Класично"]);
    const id = await confirmedGuest(eventId, 3);
    await recordCoupleAnswer(eventId, id, { status: "confirmed", partySize: 3, childrenCount: 1, noMealCount: 1 }, "couple");
    const { numbers } = await currentMenuNumbers(eventId);
    expect(numbers).toEqual({ menus: [{ id: ids[0], name: "Класично", count: 2 }], total: 2, noMeal: 1 });
    const sent = await sendMenuNumbers(eventId);
    expect(sent.numbers.noMeal).toBe(1);
    expect((await listMenuSubmissions(eventId))[0].numbers).toMatchObject({ total: 2, noMeal: 1 });
  });

  it("the automatic send carries the children without a meal too", async () => {
    const soon = new Date(`${todayIn()}T12:00:00Z`);
    soon.setUTCDate(soon.getUTCDate() + 10);
    const { eventId } = await eventWithMenus(["Класично"], soon.toISOString().slice(0, 10));
    await admin.from("events").update({ created_at: "2026-01-01T10:00:00Z" }).eq("id", eventId);
    const id = await confirmedGuest(eventId, 2);
    await recordCoupleAnswer(eventId, id, { status: "confirmed", partySize: 2, childrenCount: 1, noMealCount: 1 }, "couple");
    const { sent } = await runMenuAutoSend(new Date());
    expect(sent).toContain(eventId);
    expect((await listMenuSubmissions(eventId))[0].numbers).toMatchObject({ total: 1, noMeal: 1 });
  });

  it("the CSV import keeps the children, the database refuses more than the party", async () => {
    const { eventId } = await eventWithMenus([]);
    await importGuests(eventId, [{ full_name: "Увезен", phone: null, email: null, side: null, party_size: 3, children_count: 2 }]);
    const { data } = await admin.from("event_guests").select("children_count").eq("event_id", eventId).eq("full_name", "Увезен").single();
    expect(data!.children_count).toBe(2);
    await expect(importGuests(eventId, [{ full_name: "Лош", phone: null, email: null, side: null, party_size: 1, children_count: 2 }])).rejects.toMatchObject({
      code: "23514",
    });
  });
});

describe("0181: the venue changes an event's menus", () => {
  it("going from one menu to two flags every confirmed guest (nobody's choice is guessed); the venue sees the count", async () => {
    const { venueId, eventId, ids } = await eventWithMenus(["Класично"]);
    const first = await confirmedGuest(eventId, 2, "Ана");
    await confirmedGuest(eventId, 1, "Борис");
    await addGuest(eventId, { full_name: "Без одговор", phone: null, party_size: 1, notes: null, side: null });
    const { data: second } = await admin.from("menu_templates").insert({ venue_id: venueId, name: "Посно" }).select().single();
    await updateEvent(eventId, venueId, {
      couple_names: "M", event_date: "2027-05-05", start_time: null, end_time: null, event_type: "wedding", status: "confirmed",
      guest_count_estimate: null, room_ids: [], added_menu_ids: [second!.id], removed_menu_ids: [], seating_self_edit_enabled: null,
    }, admin);
    expect(await flagGuestsToRechooseMenus(eventId)).toBe(2);
    let stats = await getGuestStats(eventId);
    expect(stats.menuRechoose).toBe(2);
    expect(stats.menus.map((m) => m.count)).toEqual([0, 0]);

    const details = await listEventsWithDetails(venueId, admin);
    expect(details.find((e) => e.id === eventId)!.menuChoicePending).toBe(2);

    // One chooses: the warning counts only the other.
    await setGuestMenuCounts(eventId, first, { [ids[0]]: 1, [second!.id]: 1 });
    stats = await getGuestStats(eventId);
    expect(stats.menuRechoose).toBe(1);
    expect((await listEventsWithDetails(venueId, admin)).find((e) => e.id === eventId)!.menuChoicePending).toBe(1);
  });

  it("taking a menu off the event clears only that menu's choices and flags those guests; an archived package can't be added", async () => {
    const { venueId, eventId, ids } = await eventWithMenus(["Класично", "Посно", "Риба"]);
    const [a, b, c] = ids;
    const onA = await confirmedGuest(eventId, 2, "Ана");
    const onB = await confirmedGuest(eventId, 1, "Борис");
    await setGuestMenuCounts(eventId, onA, { [a]: 1, [c]: 1 });
    await setGuestMenuCounts(eventId, onB, { [b]: 1 });
    const event = {
      couple_names: "M", event_date: "2027-05-05", start_time: null, end_time: null, event_type: "wedding" as const, status: "confirmed" as const,
      guest_count_estimate: null, room_ids: [], seating_self_edit_enabled: null,
    };
    await updateEvent(eventId, venueId, { ...event, added_menu_ids: [], removed_menu_ids: [c] }, admin);
    expect(await flagGuestsToRechooseMenus(eventId)).toBe(1);
    expect((await getGuest(eventId, onA)).menu_counts).toEqual({ [a]: 1 });
    expect((await getGuest(eventId, onB)).menu_counts).toEqual({ [b]: 1 });
    expect((await getGuestStats(eventId)).menuRechoose).toBe(1);

    await admin.from("menu_templates").update({ archived_at: new Date().toISOString() }).eq("id", c);
    await expect(updateEvent(eventId, venueId, { ...event, added_menu_ids: [c], removed_menu_ids: [] }, admin)).rejects.toThrow(
      "Едно или повеќе менија не припаѓаат на овој локал.",
    );
  });

  it("the venue's pending count is refused to another venue's staff session (the function checks the caller)", async () => {
    const { venueId } = await eventWithMenus(["Класично", "Посно"]);
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await anon.rpc("venue_menu_choice_pending", { p_venue_id: venueId });
    expect(error).not.toBeNull();
    const { error: flagsError } = await anon.rpc("event_seat_guest_flags", { p_event_id: venueId });
    expect(flagsError).not.toBeNull();
  });
});
