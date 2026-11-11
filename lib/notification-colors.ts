// Notification colours, shared by the venue's and (later) the couple's
// "Известувања": every kind has one colour, and the legend names them.

export type NotificationColor = "yellow" | "green" | "blue" | "grey" | "red";

export const NOTIFICATION_COLORS: NotificationColor[] = ["yellow", "green", "blue", "grey", "red"];

export function isNotificationColor(v: unknown): v is NotificationColor {
  return typeof v === "string" && (NOTIFICATION_COLORS as string[]).includes(v);
}

/** `icon` is the <Icon /> sprite name shown on the filter pill and on each row. */
export type LegendEntry = { color: NotificationColor; label: string; icon: string };

export const VENUE_LEGEND: LegendEntry[] = [
  { color: "yellow", label: "Промени од парот", icon: "send" },
  { color: "green", label: "Бројки за мени", icon: "bookmark" },
  { color: "blue", label: "Настани", icon: "cal" },
  { color: "grey", label: "Пристап", icon: "login" },
  { color: "red", label: "Приватност", icon: "shield" },
];

const VENUE_KIND_COLORS: Record<string, NotificationColor> = {
  couple_change: "yellow",
  menu_numbers: "green",
  event_created: "blue",
  event_deleted: "blue",
  event_updated: "blue",
  event_contact_updated: "blue",
  event_finance_updated: "blue",
  credentials_created: "grey",
  password_regenerated: "grey",
  manager_added: "grey",
  manager_removed: "grey",
  seating_sent: "yellow",
  seating_approved: "yellow",
  seating_rejected: "yellow",
  data_erased: "red",
  data_exported: "red",
};

export function venueKindColor(kind: string): NotificationColor {
  return VENUE_KIND_COLORS[kind] ?? "grey";
}

export const COUPLE_LEGEND: LegendEntry[] = [
  { color: "yellow", label: "Промени од салата", icon: "edit" },
  { color: "green", label: "Одговори од гости", icon: "mail" },
  { color: "blue", label: "Потсетници", icon: "bell" },
];

const COUPLE_KIND_COLORS: Record<string, NotificationColor> = {
  venue_change: "yellow",
  guest_reply: "green",
  reminder: "blue",
};

export function coupleKindColor(kind: string): NotificationColor {
  return COUPLE_KIND_COLORS[kind] ?? "blue";
}

/** Per-colour totals for the filter pills, plus `all`. */
export type NotificationCounts = Partial<Record<NotificationColor, number>> & { all: number };

export function countByColor(colors: NotificationColor[]): NotificationCounts {
  const counts: NotificationCounts = { all: colors.length };
  for (const c of colors) counts[c] = (counts[c] ?? 0) + 1;
  return counts;
}
