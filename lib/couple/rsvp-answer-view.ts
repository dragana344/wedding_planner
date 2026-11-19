// RSVP answers as the couple reads them (group B task 1): what an answer
// changed on the guest, and whether it is over the invited number. Pure, so
// the inbox and the guest detail use it in the browser and it is unit-tested
// without a database.
import type { RsvpStatus } from "@/lib/couple/guests";
import { STATUS_LABELS } from "@/lib/couple/guest-labels";
import type { MenuCounts } from "@/lib/couple/guest-menus";
import { formatVenueDatePadded, formatVenueDateTime } from "@/lib/date";

/** A guest's answer fields at one moment (event_rsvp_answers.before / .after). */
export type AnswerSnapshot = {
  status: string;
  party_size: number;
  children_count: number;
  menu_counts: MenuCounts;
  /** Children eating no adult menu (0181; missing on older answers). */
  no_meal_count?: number;
  allergies: string | null;
  household_names: string[];
};

export const CHILDREN_OVER_PARTY_ERROR = "Децата не можат да бидат повеќе од бројот на лица.";
export const HOUSEHOLD_NAMES_MAX = 100;

/** Null when the numbers fit together, otherwise the message to show. */
export function checkPartyNumbers(partySize: number, childrenCount: number): string | null {
  return childrenCount > partySize ? CHILDREN_OVER_PARTY_ERROR : null;
}

/** Trimmed, non-blank names, at most HOUSEHOLD_NAMES_MAX of 200 characters each. */
export function cleanHouseholdNames(names: readonly (string | null | undefined)[] | null | undefined): string[] {
  return (names ?? [])
    .map((n) => (n ?? "").trim().replace(/\s+/g, " ").slice(0, 200))
    .filter(Boolean)
    .slice(0, HOUSEHOLD_NAMES_MAX);
}

/** How many people over the invited number a yes is (0 when not over, or no number was set). */
export function overInvited(status: string, partySize: number | null, invitedPartySize: number | null | undefined): number {
  if (status !== "confirmed" || partySize === null || !invitedPartySize) return 0;
  return Math.max(0, partySize - invitedPartySize);
}

/** "+2 над поканетите", or "" when not over. */
export function overInvitedLabel(over: number): string {
  return over > 0 ? `+${over} над поканетите` : "";
}

const statusLabel = (s: string) => STATUS_LABELS[s as RsvpStatus] ?? s;
const people = (n: number) => (n === 1 ? "1 лице" : `${n} лица`);

function menuText(counts: MenuCounts, menus: readonly { id: string; name: string }[]): string {
  const parts = menus.filter((m) => (counts[m.id] ?? 0) > 0).map((m) => `${m.name} ${counts[m.id]}`);
  return parts.length > 0 ? parts.join(", ") : "—";
}

/**
 * What an applied answer changed, one short line per field: "Потврден →
 * Одбиен", "2 → 4 лица", "Деца: 0 → 1", "Мени: Месо 2 → Месо 3, Посно 1",
 * "Алергии: — → ореви", "Со: Ана, Марко". A first answer (no `before`) lists
 * what it set. Unchanged fields are left out.
 */
export function describeChanges(before: AnswerSnapshot | null, after: AnswerSnapshot | null, menus: readonly { id: string; name: string }[] = []): string[] {
  if (!after) return [];
  const lines: string[] = [];
  const b = before;
  if (!b || b.status !== after.status) lines.push(b ? `${statusLabel(b.status)} → ${statusLabel(after.status)}` : statusLabel(after.status));
  if (!b) {
    if (after.status === "confirmed") lines.push(people(after.party_size));
  } else if (b.party_size !== after.party_size) {
    lines.push(`${b.party_size} → ${people(after.party_size)}`);
  }
  if (b ? b.children_count !== after.children_count : after.children_count > 0) {
    lines.push(b ? `Деца: ${b.children_count} → ${after.children_count}` : `Деца: ${after.children_count}`);
  }
  const noMealBefore = b?.no_meal_count ?? 0;
  const noMealAfter = after.no_meal_count ?? 0;
  if (b ? noMealBefore !== noMealAfter : noMealAfter > 0) {
    lines.push(b ? `Деца без оброк: ${noMealBefore} → ${noMealAfter}` : `Деца без оброк: ${noMealAfter}`);
  }
  if (menus.length > 1) {
    const was = b ? menuText(b.menu_counts, menus) : "—";
    const now = menuText(after.menu_counts, menus);
    if (was !== now) lines.push(b ? `Мени: ${was} → ${now}` : `Мени: ${now}`);
  }
  if ((b?.allergies ?? null) !== after.allergies) lines.push(`Алергии: ${b?.allergies ?? "—"} → ${after.allergies ?? "—"}`);
  const names = after.household_names.join(", ");
  if ((b?.household_names ?? []).join(", ") !== names && names) lines.push(`Со: ${names}`);
  return lines;
}

export type AnswerSource = "personal" | "shared" | "couple";
export type AnswerMatch = "personal" | "exact" | "remembered" | "phone" | "new" | "review" | "couple";
/** 'linked' (0184): tied to a guest who had a newer answer, without changing them ("Само поврзи"). */
export type ReviewState = "none" | "pending" | "applied" | "ignored" | "linked";
/** Why a pending answer waits besides an unsure match (0180). */
export type ReviewReason = "guest_limit";
export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  guest_limit: "Лимитот на гости е достигнат — гостинот не можеше да се додаде.",
};

/** One answer in the couple's "Одговори" inbox (newest first). */
export type InboxAnswer = {
  id: string;
  createdAt: string;
  source: AnswerSource;
  /** The name as typed on the shared link (or the guest's name on a personal link / the couple's entry). */
  fullName: string;
  phone: string | null;
  /** A guest's answer; the couple's own changes (0184) may also set "invited" / "pending". */
  status: "confirmed" | "declined" | "later" | "invited" | "pending";
  partySize: number | null;
  childrenCount: number;
  menuCounts: MenuCounts;
  /** Children eating no adult menu (0181). */
  noMealCount?: number;
  allergies: string | null;
  comment: string | null;
  householdNames: string[];
  match: AnswerMatch;
  reviewState: ReviewState;
  /** Why it waits besides an unsure match (0180): the guest limit was reached. */
  reviewReason?: ReviewReason | null;
  /** The guest it was applied to, with their name now (null while pending, ignored, or the guest was deleted). */
  guestId: string | null;
  guestName: string | null;
  invitedPartySize: number | null;
  before: AnswerSnapshot | null;
  after: AnswerSnapshot | null;
  /** Pending only: the guests it most likely belongs to, best first. */
  suggestions: { id: string; fullName: string }[];
};

/** One applied answer in a guest's "Историја на одговори". */
export type GuestAnswerHistoryItem = {
  id: string;
  createdAt: string;
  source: AnswerSource;
  comment: string | null;
  /** 0184: tied to the guest without changing them ("Само поврзи"). */
  linked?: boolean;
  before: AnswerSnapshot | null;
  after: AnswerSnapshot | null;
};

/** "Овој гостин има понов одговор (14.06 18:30)." — a pending answer would overwrite a newer one. */
export function newerAnswerText(newerAt: string): string {
  const time = formatVenueDateTime(newerAt, { time: true }).split(" ")[1] ?? "";
  return `Овој гостин има понов одговор (${formatVenueDatePadded(newerAt).slice(0, 5)} ${time}).`;
}

export const SOURCE_LABELS: Record<AnswerSource, string> = {
  personal: "Лична покана",
  shared: "Линк за сите",
  couple: "Внесено од вас",
};
