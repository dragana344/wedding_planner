import type { ChangeSection, EventChange, SeenSection, Side } from "./types";

export const SECTION_LABELS: Record<SeenSection, string> = {
  date_time: "Датум и време",
  rooms: "Простории",
  menus: "Мени",
  guest_count: "Број на гости",
  contact: "Контакт",
  finance: "Финансии",
  menu_numbers: "Бројки за мени",
  guest_replies: "Одговори од гости",
};

/** The sections each side is shown marks for (the other side's changes in them). */
export const SECTIONS_FOR_VIEWER: Record<Side, ChangeSection[]> = {
  couple: ["date_time", "rooms", "menus", "guest_count", "contact", "finance"],
  venue: ["guest_count", "contact"],
};

/**
 * The other side's changes the viewer has not yet seen. Nothing counts on a
 * past event. Couple marks only count after the couple's first login, so
 * what the venue set up while creating the event is never shown as a change
 * (null = they have not logged in = no marks).
 */
export function unseenChanges(
  changes: EventChange[],
  viewer: Side,
  seen: Partial<Record<SeenSection, string>>,
  opts: { eventDate: string; today: string; coupleFirstLoginAt: string | null },
): EventChange[] {
  if (opts.eventDate < opts.today) return [];
  if (viewer === "couple" && opts.coupleFirstLoginAt === null) return [];
  const sections = SECTIONS_FOR_VIEWER[viewer];
  const firstLogin = opts.coupleFirstLoginAt === null ? null : Date.parse(opts.coupleFirstLoginAt);
  return changes.filter((c) => {
    if (c.side === viewer || !sections.includes(c.section)) return false;
    const at = Date.parse(c.changedAt);
    if (viewer === "couple" && firstLogin !== null && at <= firstLogin) return false;
    const seenUpTo = seen[c.section];
    return seenUpTo === undefined || at > Date.parse(seenUpTo);
  });
}

export function groupBySection(changes: EventChange[]): Partial<Record<ChangeSection, EventChange[]>> {
  const out: Partial<Record<ChangeSection, EventChange[]>> = {};
  for (const c of changes) (out[c.section] ??= []).push(c);
  for (const list of Object.values(out)) list.sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt));
  return out;
}

export function sideName(side: Side, changedBy: string | null): string {
  return side === "venue" ? "Салата" : (changedBy ?? "Младенците");
}
