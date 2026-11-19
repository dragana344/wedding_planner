import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";
import { guestMenuMeals, isGuestDone, menuSplitFits, NO_MEAL_OVER_CHILDREN_ERROR, validateMenuCounts, type MenuCounts } from "@/lib/couple/guest-menus";
import { CHILDREN_OVER_PARTY_ERROR } from "@/lib/couple/rsvp-answer-view";

export type RsvpStatus = "invited" | "confirmed" | "declined" | "pending" | "later";
export type GuestSide = "bride" | "groom";
export type InvitationChannel = "whatsapp" | "viber" | "sms" | "email" | "link";

export interface Guest {
  id: string;
  event_id: string;
  full_name: string;
  phone: string | null;
  party_size: number;
  rsvp_status: RsvpStatus;
  notes: string | null;
  side: GuestSide | null;
  /** SEC-021: when the public invitation link last set this guest's answer. */
  rsvp_changed_via_link_at?: string | null;
  rsvp_previous_status?: RsvpStatus | null;
  /** Personal invite link token (`/invite/<slug>?g=<token>`, A1). */
  invite_token: string;
  email: string | null;
  children_count: number;
  /** How many of the party eat each of the event's menus (menu id -> count). */
  menu_counts: MenuCounts;
  allergies: string | null;
  rsvp_comment: string | null;
  invitation_sent_at: string | null;
  invitation_channel: InvitationChannel | null;
  /** Names of the people coming with the guest, from their answer (0179). */
  household_names?: string[];
  /** How many people the couple invited with this guest; an answer above it is flagged (0179). */
  invited_party_size?: number | null;
  /** Of `children_count`: children who eat no adult menu ("дете / без оброк", 0181). */
  no_meal_count?: number;
  /** Set when the venue changed the event's menus and this guest's split stopped fitting (0181). */
  menu_rechoose_at?: string | null;
}

export interface GuestInput {
  full_name: string;
  phone: string | null;
  party_size: number;
  notes: string | null;
  side: GuestSide | null;
  email?: string | null;
  invited_party_size?: number | null;
}

export interface GuestStats {
  total: number;
  confirmed: number;
  declined: number;
  pending: number;
  invited: number;
  /** "I'll answer later" (A2). */
  later: number;
  totalAttending: number;
  /** Of `totalAttending`. */
  childrenAttending: number;
  /**
   * 0181: of the done, confirmed guests' children, those eating no adult menu
   * — the kitchen's "Деца без оброк" line, next to `menus`.
   */
  noMeal: number;
  /** 0181: confirmed guests who must choose their menus again after the venue changed the event's menus. */
  menuRechoose: number;
  /** The event's menus with the number of confirmed guests eating each (the kitchen's totals). */
  menus: { id: string; name: string; count: number }[];
  /** Guests the couple still has to hear from or finish choosing menus for, by name. */
  /**
   * Guests without a final answer. `people` (0182) is how many they are
   * likely to be — the confirmed party, else "поканети: N", else the party
   * size — what the menu-numbers estimate is prefilled from.
   */
  notDone: { id: string; full_name: string; people?: number }[];
  invitationsSent: number;
  /**
   * Done, confirmed guests' allergy notes, grouped by the menu they chose —
   * the raw material for the couple's own summary (or the venue's fallback
   * when the couple doesn't write one). Never combines or parses the text
   * itself; menus with no notes are left out.
   */
  allergyNotes: AllergyMenuGroup[];
}

export type AllergyMenuGroup = { menuId: string; menuName: string; notes: { guestId: string; guestName: string; text: string }[] };

/** Where a guest sits, from the seating plan (Session 3's `guest_seat()`). */
export interface GuestSeat {
  table_label: string | null;
  seat_number: number | null;
  room_name: string | null;
}

// One literal (not concatenated) so supabase-js can type the rows.
export const GUEST_COLUMNS =
  "id, event_id, full_name, phone, party_size, rsvp_status, notes, side, rsvp_changed_via_link_at, rsvp_previous_status, invite_token, email, children_count, allergies, rsvp_comment, invitation_sent_at, invitation_channel, household_names, invited_party_size, no_meal_count, menu_rechoose_at, event_guest_menu_counts(menu_template_id, count)";

type GuestRow = Omit<Guest, "menu_counts"> & { event_guest_menu_counts: { menu_template_id: string; count: number }[] | null };

/** A guest row as selected with `GUEST_COLUMNS`, with its menu counts as a map. */
export function toGuest(row: GuestRow): Guest {
  const { event_guest_menu_counts, ...guest } = row;
  const menu_counts: MenuCounts = {};
  for (const c of event_guest_menu_counts ?? []) menu_counts[c.menu_template_id] = c.count;
  return { ...guest, menu_counts };
}

export async function listGuests(eventId: string): Promise<Guest[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_guests")
    .select(GUEST_COLUMNS)
    .eq("event_id", eventId)
    .order("created_at")
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  return checkListBound(data as unknown as GuestRow[], "event_guests").map(toGuest);
}

export async function addGuest(eventId: string, input: GuestInput): Promise<Guest> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_guests")
    .insert({ event_id: eventId, ...input })
    .select(GUEST_COLUMNS)
    .single();
  if (error) throw error;
  return toGuest(data as unknown as GuestRow);
}

export const MENUS_OVER_PARTY_ERROR = "Менијата се избрани за повеќе лица од новиот број — поправете ги во „Внеси одговор“.";

/**
 * The couple's plain edit. A smaller party may not leave more children, or a
 * bigger menu split, than people (0181): a confirmed guest's split has to be
 * fixed through their answer first; anyone else's no longer fits, so it goes.
 */
export async function updateGuest(eventId: string, guestId: string, input: GuestInput): Promise<Guest> {
  const client = createServiceRoleClient();
  const current = await getGuest(eventId, guestId);
  if (input.party_size < current.children_count) throw new Error(CHILDREN_OVER_PARTY_ERROR);
  const split = Object.values(current.menu_counts).reduce((sum, n) => sum + n, 0) + (current.no_meal_count ?? 0);
  if (split > input.party_size) {
    if (current.rsvp_status === "confirmed") throw new Error(MENUS_OVER_PARTY_ERROR);
    await replaceGuestMenuCounts(guestId, {});
  }
  const { data, error } = await client
    .from("event_guests")
    .update(input)
    .eq("id", guestId)
    .eq("event_id", eventId)
    .select(GUEST_COLUMNS)
    .single();
  if (error) throw error;
  return toGuest(data as unknown as GuestRow);
}

export async function updateGuestStatus(eventId: string, guestId: string, status: RsvpStatus): Promise<Guest> {
  const client = createServiceRoleClient();
  // Scoped by event: another event's guest is never touched (nor their counts).
  const { data: touched, error: updateError } = await client
    .from("event_guests")
    .update({ rsvp_status: status })
    .eq("id", guestId)
    .eq("event_id", eventId)
    .select("id");
  if (updateError) throw updateError;
  if (!touched || touched.length === 0) throw new Error("Гостинот не е пронајден.");
  // 0181: the menu choice stays whatever the answer — it is only left out of
  // the totals while the guest isn't confirmed, and counts again if they
  // confirm with the same party.
  return getGuest(eventId, guestId);
}

export async function getGuest(eventId: string, guestId: string): Promise<Guest> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_guests").select(GUEST_COLUMNS).eq("id", guestId).eq("event_id", eventId).single();
  if (error) throw error;
  return toGuest(data as unknown as GuestRow);
}

/** The couple's "Поканети лица" for a guest (null clears it). */
export async function updateGuestInvited(eventId: string, guestId: string, invited: number | null): Promise<Guest> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_guests")
    .update({ invited_party_size: invited })
    .eq("id", guestId)
    .eq("event_id", eventId)
    .select(GUEST_COLUMNS)
    .single();
  if (error) throw error;
  return toGuest(data as unknown as GuestRow);
}

export async function eventMenuIds(eventId: string): Promise<string[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_menu_templates").select("menu_template_id").eq("event_id", eventId);
  if (error) throw error;
  return (data ?? []).map((r) => r.menu_template_id);
}

export const GUEST_NOT_CONFIRMED_ERROR = "Гостинот не е потврден.";

/** Replaces the guest's stored menu split with `counts` (already validated; {} clears it, and the no-meal children with it). */
export async function replaceGuestMenuCounts(guestId: string, counts: MenuCounts, noMeal = 0): Promise<void> {
  const client = createServiceRoleClient();
  const { error: noMealError } = await client.from("event_guests").update({ no_meal_count: noMeal }).eq("id", guestId);
  if (noMealError) throw noMealError;
  const { error: deleteError } = await client.from("event_guest_menu_counts").delete().eq("guest_id", guestId);
  if (deleteError) throw deleteError;
  const rows = Object.entries(counts).map(([menu_template_id, count]) => ({ guest_id: guestId, menu_template_id, count }));
  if (rows.length > 0) {
    const { error: insertError } = await client.from("event_guest_menu_counts").insert(rows);
    if (insertError) throw insertError;
  }
}

/**
 * Replaces how a confirmed guest's party splits across the event's menus.
 * Checked against the event's menus and the guest's current party size
 * (`validateMenuCounts`); returns the updated guest.
 */
export async function setGuestMenuCounts(eventId: string, guestId: string, counts: MenuCounts, noMeal?: number): Promise<Guest> {
  const guest = await getGuest(eventId, guestId);
  if (guest.rsvp_status !== "confirmed") throw new Error(GUEST_NOT_CONFIRMED_ERROR);
  const meals = noMeal ?? guest.no_meal_count ?? 0;
  if (meals > guest.children_count) throw new Error(NO_MEAL_OVER_CHILDREN_ERROR);
  const checked = validateMenuCounts(await eventMenuIds(eventId), guest.party_size, counts, meals);
  if (!checked.ok) throw new Error(checked.error);

  await replaceGuestMenuCounts(guestId, checked.counts, meals);
  return getGuest(eventId, guestId);
}

/**
 * 0181: after the venue changed the event's menus (one taken off, or a second
 * one added), marks the confirmed guests whose split no longer fits — the
 * couple's "N гости треба повторно да изберат мени". Nothing is assigned for
 * them: going from one menu to two, nobody's choice is guessed.
 */
export async function flagGuestsToRechooseMenus(eventId: string): Promise<number> {
  const [guests, menuIds] = await Promise.all([listGuests(eventId), eventMenuIds(eventId)]);
  if (menuIds.length < 2) return 0;
  const ids = guests.filter((g) => g.rsvp_status === "confirmed" && !menuSplitFits(g, menuIds)).map((g) => g.id);
  if (ids.length === 0) return 0;
  const { error } = await createServiceRoleClient()
    .from("event_guests")
    .update({ menu_rechoose_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .in("id", ids);
  if (error) throw error;
  return ids.length;
}

export async function updateGuestSide(eventId: string, guestId: string, side: GuestSide | null): Promise<Guest> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_guests")
    .update({ side })
    .eq("id", guestId)
    .eq("event_id", eventId)
    .select(GUEST_COLUMNS)
    .single();
  if (error) throw error;
  return toGuest(data as unknown as GuestRow);
}

export const OTHER_SIDE_ERROR = "Како ко-организатор можете да менувате само гости од вашата страна.";

/**
 * A12: a co-organizer sees every guest but manages only their own side's.
 * `organizerSide` is null for the couple's own login, which may do anything.
 */
export async function assertGuestOnSide(eventId: string, guestId: string, organizerSide: GuestSide | null): Promise<void> {
  if (!organizerSide) return;
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_guests").select("side").eq("id", guestId).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  if (data && data.side !== organizerSide) throw new Error(OTHER_SIDE_ERROR);
}

/**
 * Deletes the guest. Their answer history goes with them (0184: the answers'
 * guest link cascades) — it held their personal data with nothing left to
 * show it on. Answers still waiting in "Да се провери" belong to no guest
 * and stay until resolved or the event is erased.
 */
export async function deleteGuest(eventId: string, guestId: string): Promise<void> {
  const client = createServiceRoleClient();
  const { error } = await client.from("event_guests").delete().eq("id", guestId).eq("event_id", eventId);
  if (error) throw error;
}

/** One guest from a CSV the couple uploads (see `parseGuestCsv`). */
export interface GuestImportInput {
  full_name: string;
  phone: string | null;
  email: string | null;
  side: GuestSide | null;
  party_size: number;
  /** 0181: optional "Деца" column, never more than the party. */
  children_count?: number;
}

/**
 * Adds uploaded guests in one insert (A20). A name already on the list (or
 * repeated in the file) is skipped, so uploading the same file twice adds
 * nobody twice. Refuses, adding nothing, past the list bound.
 */
export async function importGuests(eventId: string, rows: GuestImportInput[]): Promise<{ imported: number; skipped: number }> {
  const existing = await listGuests(eventId);
  const seen = new Set(existing.map((g) => g.full_name.trim().toLowerCase()));
  const fresh = rows.filter((r) => {
    const key = r.full_name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (existing.length + fresh.length > MAX_LIST_ROWS) {
    throw new Error(`Листата може да има најмногу ${MAX_LIST_ROWS} гости.`);
  }
  if (fresh.length > 0) {
    const client = createServiceRoleClient();
    const { error } = await client
      .from("event_guests")
      .insert(fresh.map((r) => ({ event_id: eventId, ...r, full_name: r.full_name.trim() })), { defaultToNull: false });
    if (error) throw error;
  }
  return { imported: fresh.length, skipped: rows.length - fresh.length };
}

export async function getGuestStats(eventId: string): Promise<GuestStats> {
  const [guests, menuIds, menuNames] = await Promise.all([listGuests(eventId), eventMenuIds(eventId), getEventMenuNames(eventId)]);
  const attending = guests.filter((g) => g.rsvp_status === "confirmed");
  const done = attending.filter((g) => isGuestDone(g, menuIds));
  // One menu: nothing to choose, so every confirmed party eats it (but its
  // no-meal children). Only guests who are done count: partial or stale
  // choices are left out — and so is anyone not confirmed, whose kept
  // choice (0181) waits in case they confirm again.
  const menus = menuNames.map(({ id, name }) => ({
    id,
    name,
    count: done.reduce((sum, g) => sum + guestMenuMeals(g, id, menuIds), 0),
  }));
  const noteWorthy = attending.filter((g) => isGuestDone(g, menuIds) && g.allergies && g.allergies.trim());
  const allergyNotes: AllergyMenuGroup[] = menus
    .map(({ id, name }) => ({
      menuId: id,
      menuName: name,
      // Single menu: every done, confirmed guest is on it, same as `count` above.
      notes: noteWorthy
        .filter((g) => menuIds.length === 1 || (g.menu_counts[id] ?? 0) > 0)
        .map((g) => ({ guestId: g.id, guestName: g.full_name, text: g.allergies!.trim() })),
    }))
    .filter((g) => g.notes.length > 0);

  return {
    total: guests.length,
    confirmed: attending.length,
    declined: guests.filter((g) => g.rsvp_status === "declined").length,
    pending: guests.filter((g) => g.rsvp_status === "pending").length,
    invited: guests.filter((g) => g.rsvp_status === "invited").length,
    later: guests.filter((g) => g.rsvp_status === "later").length,
    totalAttending: attending.reduce((sum, g) => sum + g.party_size, 0),
    childrenAttending: attending.reduce((sum, g) => sum + g.children_count, 0),
    noMeal: menuIds.length > 0 ? done.reduce((sum, g) => sum + (g.no_meal_count ?? 0), 0) : 0,
    menuRechoose: menuIds.length > 1 ? attending.filter((g) => g.menu_rechoose_at && !menuSplitFits(g, menuIds)).length : 0,
    menus,
    notDone: guests
      .filter((g) => !isGuestDone(g, menuIds))
      .map((g) => ({ id: g.id, full_name: g.full_name, people: g.rsvp_status === "confirmed" ? g.party_size : (g.invited_party_size ?? g.party_size) }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "mk")),
    invitationsSent: guests.filter((g) => g.invitation_sent_at !== null).length,
    allergyNotes,
  };
}

/** The event's menus (id, name) by name then id. */
export async function getEventMenuNames(eventId: string): Promise<{ id: string; name: string }[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_menu_templates").select("menu_templates(id, name)").eq("event_id", eventId);
  if (error) throw error;
  type T = { id: string; name: string };
  return ((data ?? []) as unknown as { menu_templates: T | T[] | null }[])
    .map((l) => (Array.isArray(l.menu_templates) ? l.menu_templates[0] : l.menu_templates))
    .filter((t): t is T => Boolean(t))
    .sort((a, b) => a.name.localeCompare(b.name, "mk") || a.id.localeCompare(b.id));
}

/** Postgres/PostgREST codes for "no such function": seating has not shipped `guest_seat()` yet. */
const MISSING_FUNCTION = new Set(["PGRST202", "42883"]);

/**
 * The guest's table and seat, or null when unseated, not this event's guest,
 * or the seating plan does not provide `guest_seat()` (yet).
 */
export async function getGuestSeat(eventId: string, guestId: string): Promise<GuestSeat | null> {
  const client = createServiceRoleClient();
  const { data: guest, error: guestError } = await client
    .from("event_guests")
    .select("id")
    .eq("id", guestId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (guestError) throw guestError;
  if (!guest) return null;

  const { data, error } = await client.rpc("guest_seat", { p_guest_id: guestId });
  if (error) {
    if (MISSING_FUNCTION.has(error.code)) return null;
    throw error;
  }
  const rows = (data ?? []) as GuestSeat[];
  return rows[0] ?? null;
}
