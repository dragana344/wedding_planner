import { describeChange, formatChangedAt } from "./format";
import { SECTION_LABELS } from "./rules";
import type { ChangeSection, EventChange, GuestReplyLike } from "./types";

export type CoupleNoticeProps = {
  section: ChangeSection;
  title: string;
  lines: { key: string; text: string }[];
  /** The newest shown change's time, unchanged: the server keeps the later of this and what was seen. */
  upTo: string;
};

/** The box props for one section's unseen venue changes (null when there are none). */
export function coupleNotice(section: ChangeSection, changes: EventChange[] | undefined): CoupleNoticeProps | null {
  if (!changes || changes.length === 0) return null;
  const upTo = changes.reduce((a, c) => (Date.parse(c.changedAt) > Date.parse(a.changedAt) ? c : a)).changedAt;
  return {
    section,
    title: SECTION_LABELS[section],
    lines: changes.map((c) => ({ key: c.id, text: `${formatChangedAt(c.changedAt)} · ${describeChange(c, { redactPrivate: false })}` })),
    upTo,
  };
}

/**
 * Guests' replies the couple has not seen: later than `seenUpTo` (never seen = all of them).
 * Nothing counts on a past event.
 */
export function newGuestReplies<R extends GuestReplyLike>(replies: R[], seenUpTo: string | undefined, eventDate: string, today: string): R[] {
  if (eventDate < today) return [];
  const seen = seenUpTo === undefined ? null : Date.parse(seenUpTo);
  return replies.filter((r) => seen === null || Date.parse(r.at) > seen);
}
