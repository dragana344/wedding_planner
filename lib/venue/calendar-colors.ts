// Deterministic per-room colors for the venue's calendars (the event-wizard's
// date step, Календар / Планер and the dashboard's small calendars) —
// each room gets a stable color (by its position in the venue's own room
// list) so the same room always draws the same ring color across renders.

const PALETTE = [
  "#c9992f", // gold — matches the app's own accent, used first
  "#2563eb", // blue
  "#16a34a", // green
  "#dc2626", // red
  "#9333ea", // purple
  "#0891b2", // teal
  "#ea580c", // orange
  "#db2777", // pink
] as const;

/** `roomIds` is the venue's full room list, in a stable order — the same
 * array (or one built the same way) must be passed on every call for a
 * given room to always get the same color. */
export function roomColor(roomId: string, roomIds: string[]): string {
  const index = roomIds.indexOf(roomId);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
}

/** For an event that isn't in any room yet. */
export const NO_ROOM_COLOR = "#8b8f99";

/** An event's calendar color: its first room's color, or grey without a room. */
export function eventRoomColor(eventRoomIds: string[], roomIds: string[]): string {
  const first = eventRoomIds.find((id) => roomIds.includes(id));
  return first ? roomColor(first, roomIds) : NO_ROOM_COLOR;
}
