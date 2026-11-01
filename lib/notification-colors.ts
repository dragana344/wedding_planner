// Notification colours, shared by the venue's and (later) the couple's
// "Известувања": every kind has one colour, and the legend names them.

export type NotificationColor = "yellow" | "green" | "blue" | "grey" | "red";

export const NOTIFICATION_COLORS: NotificationColor[] = ["yellow", "green", "blue", "grey", "red"];

export function isNotificationColor(v: unknown): v is NotificationColor {
  return typeof v === "string" && (NOTIFICATION_COLORS as string[]).includes(v);
}

export const VENUE_LEGEND: { color: NotificationColor; label: string }[] = [
  { color: "yellow", label: "Промени од парот" },
  { color: "green", label: "Бројки за мени" },
  { color: "blue", label: "Настани" },
  { color: "grey", label: "Пристап" },
  { color: "red", label: "Приватност" },
];

const VENUE_KIND_COLORS: Record<string, NotificationColor> = {
  couple_change: "yellow",
  menu_numbers: "green",
  event_created: "blue",
  event_deleted: "blue",
  credentials_created: "grey",
  password_regenerated: "grey",
  data_erased: "red",
  data_exported: "red",
};

export function venueKindColor(kind: string): NotificationColor {
  return VENUE_KIND_COLORS[kind] ?? "grey";
}

export const COUPLE_LEGEND: { color: NotificationColor; label: string }[] = [
  { color: "yellow", label: "Промени од салата" },
  { color: "green", label: "Одговори од гости" },
  { color: "blue", label: "Потсетници" },
];

const COUPLE_KIND_COLORS: Record<string, NotificationColor> = {
  venue_change: "yellow",
  guest_reply: "green",
  reminder: "blue",
};

export function coupleKindColor(kind: string): NotificationColor {
  return COUPLE_KIND_COLORS[kind] ?? "blue";
}
