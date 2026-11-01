// The couple's menu numbers (what they send the venue). Pure: used by the
// couple's guest list and the venue's reservation view alike.

export type MenuNumbers = { menus: { id: string; name: string; count: number }[]; total: number };

export type MenuSubmission = {
  id: string;
  sentAt: string;
  sentBy: string;
  numbers: MenuNumbers;
  seenAt: string | null;
  seenBy: string | null;
  source: "couple" | "auto" | "venue";
  /** Guests without a final answer when the numbers went out automatically. */
  unanswered: number | null;
};

/** The menus whose count differs between two sets of numbers (a menu missing on one side counts as 0). */
export function diffMenuNumbers(prev: MenuNumbers, next: MenuNumbers): { name: string; from: number; to: number }[] {
  const before = new Map(prev.menus.map((m) => [m.id, m]));
  const out: { name: string; from: number; to: number }[] = [];
  for (const m of next.menus) {
    const from = before.get(m.id)?.count ?? 0;
    if (from !== m.count) out.push({ name: m.name, from, to: m.count });
  }
  const nextIds = new Set(next.menus.map((m) => m.id));
  for (const m of prev.menus) {
    if (!nextIds.has(m.id) && m.count !== 0) out.push({ name: m.name, from: m.count, to: 0 });
  }
  return out;
}

/** Whether the numbers differ by menu set or any count (names are ignored). */
export function menuNumbersDiffer(a: MenuNumbers, b: MenuNumbers): boolean {
  if (a.menus.length !== b.menus.length) return true;
  const other = new Map(b.menus.map((m) => [m.id, m.count]));
  return a.menus.some((m) => other.get(m.id) !== m.count);
}

/** A stored event_menu_submissions row, as the database returns it. */
export type MenuSubmissionRow = {
  id: string;
  sent_at: string;
  sent_by: string;
  counts: Record<string, number> | null;
  menu_titles: Record<string, string> | null;
  total: number;
  seen_at: string | null;
  seen_by: string | null;
  source: "couple" | "auto" | "venue";
  unanswered: number | null;
};

/** Rebuilds a submission from its row; menus ordered by title ("mk"), then id. */
export function toMenuSubmission(row: MenuSubmissionRow): MenuSubmission {
  const counts = row.counts ?? {};
  const titles = row.menu_titles ?? {};
  const menus = Object.entries(counts)
    .map(([id, count]) => ({ id, name: titles[id] ?? "", count }))
    .sort((a, b) => a.name.localeCompare(b.name, "mk") || a.id.localeCompare(b.id));
  return {
    id: row.id,
    sentAt: row.sent_at,
    sentBy: row.sent_by,
    numbers: { menus, total: row.total },
    seenAt: row.seen_at,
    seenBy: row.seen_by,
    source: row.source,
    unanswered: row.unanswered,
  };
}

/** The latest sending is waiting for the venue's Видено. */
export function hasUnseenMenuNumbers(n: { latest: MenuSubmission | null }): boolean {
  return n.latest !== null && n.latest.seenAt === null;
}
