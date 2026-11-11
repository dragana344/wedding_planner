// Printable guest list (couple-facing): one table per side for a wedding, one
// ungrouped table otherwise. Pure, like guest-csv.ts, so it is unit-tested
// without a database.
import type { Guest, GuestSide } from "@/lib/couple/guests";
import { STATUS_LABELS } from "@/lib/couple/guest-labels";
import { isGuestDone } from "@/lib/couple/guest-menus";

export interface PrintGuestRow {
  id: string;
  fullName: string;
  phone: string | null;
  partySize: number;
  childrenCount: number;
  status: string;
  menu: string;
  allergies: string | null;
}

export interface PrintGuestGroup {
  label: string | null;
  rows: PrintGuestRow[];
  totalPeople: number;
}

/** The one menu's name for a single-menu event; "Класично 2, Посно 1" for a done guest with 2+; "Нема избрано мени" while unfinished; "" otherwise. */
function menuSummary(guest: Guest, menus: readonly { id: string; name: string }[]): string {
  if (menus.length === 0 || guest.rsvp_status !== "confirmed") return "";
  if (menus.length === 1) return menus[0].name;
  if (!isGuestDone(guest, menus.map((m) => m.id))) return "Нема избрано мени";
  return menus
    .filter((m) => (guest.menu_counts[m.id] ?? 0) > 0)
    .map((m) => `${m.name} ${guest.menu_counts[m.id]}`)
    .join(", ");
}

function toRow(guest: Guest, menus: readonly { id: string; name: string }[]): PrintGuestRow {
  return {
    id: guest.id,
    fullName: guest.full_name,
    phone: guest.phone,
    partySize: guest.party_size,
    childrenCount: guest.children_count,
    status: STATUS_LABELS[guest.rsvp_status] ?? guest.rsvp_status,
    menu: menuSummary(guest, menus),
    allergies: guest.allergies,
  };
}

function group(label: string | null, guests: readonly Guest[], menus: readonly { id: string; name: string }[]): PrintGuestGroup {
  return { label, rows: guests.map((g) => toRow(g, menus)), totalPeople: guests.reduce((sum, g) => sum + g.party_size, 0) };
}

/**
 * Wedding: "Страна на невестата" and "Страна на младоженецот", plus
 * "Недоделени" only when someone has no side. Any other event type: one
 * ungrouped list (label null).
 */
export function buildPrintGuestGroups(
  guests: readonly Guest[],
  menus: readonly { id: string; name: string }[],
  isWedding: boolean,
): PrintGuestGroup[] {
  if (!isWedding) return [group(null, guests, menus)];
  const bySide = (side: GuestSide | null) => guests.filter((g) => g.side === side);
  const groups = [group("Страна на невестата", bySide("bride"), menus), group("Страна на младоженецот", bySide("groom"), menus)];
  const unassigned = bySide(null);
  if (unassigned.length > 0) groups.push(group("Недоделени", unassigned, menus));
  return groups;
}
