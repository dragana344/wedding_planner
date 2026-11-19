// Guests' menu counts: how many of a confirmed guest's party eat which of the
// event's menus, plus how many of their children eat no adult menu ("дете /
// без оброк", 0181). Pure (used by the server and the guest list in the
// browser); the database write is `setGuestMenuCounts` in lib/couple/guests.ts.
//
// A guest's split is kept whatever their answer (0181): it only counts in the
// totals while they are confirmed, and is reused if they confirm again and it
// still fits their party and the event's menus.

export type MenuCounts = Record<string, number>;

export type MenuCountsResult = { ok: true; counts: MenuCounts } | { ok: false; error: string };

export const NO_MEAL_OVER_CHILDREN_ERROR = "Децата без оброк не можат да бидат повеќе од децата.";

/**
 * Checks a guest's counts against the event's menus and party size: the menus
 * plus the no-meal children add up to the party. With 0 or 1 menus there is
 * nothing to choose, so no counts are kept.
 */
export function validateMenuCounts(menuIds: string[], partySize: number, counts: MenuCounts, noMeal = 0): MenuCountsResult {
  if (menuIds.length <= 1) return { ok: true, counts: {} };
  const allowed = new Set(menuIds);
  const kept: MenuCounts = {};
  let sum = 0;
  for (const [id, count] of Object.entries(counts)) {
    if (!allowed.has(id)) return { ok: false, error: "Непознато мени." };
    if (!Number.isInteger(count) || count < 0) return { ok: false, error: "Неважечки број на лица." };
    if (count === 0) continue;
    kept[id] = count;
    sum += count;
  }
  if (sum + noMeal !== partySize) return { ok: false, error: `Изберете мени за сите ${Math.max(0, partySize - noMeal)} лица.` };
  return { ok: true, counts: kept };
}

type MenuGuest = { rsvp_status: string; party_size: number; menu_counts: MenuCounts; no_meal_count?: number };

/** Whether a guest's stored split fits their party and the event's current menus (ignoring their answer). */
export function menuSplitFits(guest: Omit<MenuGuest, "rsvp_status">, menuIds: string[]): boolean {
  if (menuIds.length <= 1) return true;
  const allowed = new Set(menuIds);
  let sum = guest.no_meal_count ?? 0;
  for (const [id, count] of Object.entries(guest.menu_counts)) {
    if (!allowed.has(id)) return false;
    sum += count;
  }
  return sum === guest.party_size;
}

/** Whether a guest needs nothing more from the couple: declined, or confirmed with their menus chosen. */
export function isGuestDone(guest: MenuGuest, menuIds: string[]): boolean {
  if (guest.rsvp_status === "declined") return true;
  if (guest.rsvp_status !== "confirmed") return false;
  return menuSplitFits(guest, menuIds);
}

/**
 * How many meals of one menu a confirmed, done guest counts for: with a
 * single menu the whole party minus the no-meal children, otherwise their
 * own count for it. 0 for anyone not confirmed.
 */
export function guestMenuMeals(guest: MenuGuest, menuId: string, menuIds: string[]): number {
  if (guest.rsvp_status !== "confirmed") return 0;
  if (menuIds.length === 1) return menuIds[0] === menuId ? Math.max(0, guest.party_size - (guest.no_meal_count ?? 0)) : 0;
  return guest.menu_counts[menuId] ?? 0;
}

/** "Менијата се променети — 3 гости треба повторно да изберат мени" (0181). */
export function menusChangedText(n: number): string {
  return n === 1 ? "Менијата се променети — 1 гостин треба повторно да избере мени" : `Менијата се променети — ${n} гости треба повторно да изберат мени`;
}
