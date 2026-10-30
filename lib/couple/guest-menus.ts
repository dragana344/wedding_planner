// Guests' menu counts: how many of a confirmed guest's party eat which of the
// event's menus. Pure (used by the server and the guest list in the browser);
// the database write is `setGuestMenuCounts` in lib/couple/guests.ts.

export type MenuCounts = Record<string, number>;

export type MenuCountsResult = { ok: true; counts: MenuCounts } | { ok: false; error: string };

/**
 * Checks a guest's counts against the event's menus and party size. With 0 or
 * 1 menus there is nothing to choose, so no counts are kept.
 */
export function validateMenuCounts(menuIds: string[], partySize: number, counts: MenuCounts): MenuCountsResult {
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
  if (sum !== partySize) return { ok: false, error: `Изберете мени за сите ${partySize} лица.` };
  return { ok: true, counts: kept };
}

/** Whether a guest needs nothing more from the couple: declined, or confirmed with their menus chosen. */
export function isGuestDone(guest: { rsvp_status: string; party_size: number; menu_counts: MenuCounts }, menuIds: string[]): boolean {
  if (guest.rsvp_status === "declined") return true;
  if (guest.rsvp_status !== "confirmed") return false;
  if (menuIds.length <= 1) return true;
  const allowed = new Set(menuIds);
  let sum = 0;
  for (const [id, count] of Object.entries(guest.menu_counts)) {
    if (!allowed.has(id)) return false;
    sum += count;
  }
  return sum === guest.party_size;
}
