import type { EventStatus, EventType } from "./events";

/**
 * Presentation metadata for event statuses and types.
 *
 * Kept in one place so the dashboard, events list and calendar always agree on
 * wording and colour. `pill` maps onto the panel design system's pill classes.
 */

export const STATUS_META: Record<
  EventStatus,
  { label: string; pill: "p-ok" | "p-warn" | "p-info" | "p-bad" }
> = {
  preparation: { label: "Подготовка", pill: "p-warn" },
  confirmed: { label: "Потврден", pill: "p-ok" },
  in_progress: { label: "Во тек", pill: "p-info" },
  completed: { label: "Завршен", pill: "p-info" },
  cancelled: { label: "Откажан", pill: "p-bad" },
};

export const TYPE_META: Record<EventType, { label: string; icon: string; color: string }> = {
  wedding: { label: "Свадба", icon: "heart", color: "#1E7A46" },
  birthday: { label: "Роденден", icon: "gift", color: "#6B4BC0" },
  baptism: { label: "Крштевање", icon: "star", color: "#3B5BA9" },
  graduation: { label: "Матурска вечер", icon: "party", color: "#A4711A" },
  corporate: { label: "Корпоративен настан", icon: "case", color: "#2A62C6" },
  other: { label: "Друго", icon: "cal-dot", color: "#5A5F69" },
};

export const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, meta]) => ({
  value: value as EventStatus,
  label: meta.label,
}));

export const TYPE_OPTIONS = Object.entries(TYPE_META).map(([value, meta]) => ({
  value: value as EventType,
  label: meta.label,
}));

/** Postgres `time` comes back as "HH:MM:SS"; the UI only ever shows "HH:MM". */
export function formatTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

/** "19:00 – 23:00", or null when no times are recorded for the event. */
export function formatTimeRange(start: string | null, end: string | null): string | null {
  const s = formatTime(start);
  const e = formatTime(end);
  if (s && e) return `${s} – ${e}`;
  return s ?? null;
}
