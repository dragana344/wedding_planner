// Change marks: what one side (venue or couple) changed that the other side
// has not yet pressed "Видено" on. Types shared by the pure rules and the
// server data access.

export type ChangeSection = "date_time" | "rooms" | "menus" | "guest_count" | "contact" | "finance";
/** Sections a side can have seen: the logged ones, plus two that are seen-only (no log rows). */
export type SeenSection = ChangeSection | "menu_numbers" | "guest_replies";
export type Side = "venue" | "couple";

export type EventChange = {
  id: string;
  eventId: string;
  section: ChangeSection;
  side: Side;
  changedBy: string | null;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changedAt: string;
};

/** What the "new guest replies" rule needs from a reply. */
export type GuestReplyLike = { at: string };
