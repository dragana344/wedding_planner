// The couple's menu numbers (what they send the venue). Pure: used by the
// couple's guest list and the venue's reservation view alike.

/**
 * Meals per menu and their `total`, plus (0181) the children eating no adult
 * menu — "Деца без оброк", a line of its own, never part of `total`. The
 * headcount at the tables is `total + noMeal`. Older sendings have no
 * `noMeal` (read as 0).
 */
export type MenuNumbers = { menus: { id: string; name: string; count: number }[]; total: number; noMeal?: number };

export const NO_MEAL_LABEL = "Деца без оброк";

/** A done guest's allergy note, grouped under the menu they chose. Never combined or parsed — just grouped. */
export type AllergyNoteGroup = { menuId: string; menuName: string; notes: { guestId: string; guestName: string; text: string }[] };

/**
 * 0182: the unanswered guests' part of a sending, estimated per menu (by the
 * couple, or prefilled — see `prefillEstimate`). Kept apart from the real
 * `numbers` and always shown marked: "од кои проценка: 24".
 */
export type MenuEstimate = { menus: { id: string; name: string; count: number }[]; total: number };

export type MenuSubmission = {
  id: string;
  sentAt: string;
  sentBy: string;
  /** Real counts from the guests' answers. */
  numbers: MenuNumbers;
  /** 0182: the estimated part (null when everyone had answered). */
  estimate?: MenuEstimate | null;
  seenAt: string | null;
  seenBy: string | null;
  source: "couple" | "auto" | "venue";
  /** Guests without a final answer when the numbers went out (automatically, or by the couple with an estimate). */
  unanswered: number | null;
  /** 0184: how many people those guests were (what the estimate stood for); null on older sendings. */
  estimatedPeople?: number | null;
  /**
   * Allergy info, strict either/or: the couple's own free-text summary, or
   * (only when they left it blank) the raw per-guest notes grouped by menu.
   * Both null when nobody attending had a note to carry.
   */
  allergySummary: string | null;
  allergyNotes: AllergyNoteGroup[] | null;
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
  if ((prev.noMeal ?? 0) !== (next.noMeal ?? 0)) out.push({ name: NO_MEAL_LABEL, from: prev.noMeal ?? 0, to: next.noMeal ?? 0 });
  return out;
}

/** Whether the numbers differ by menu set or any count (names are ignored). */
export function menuNumbersDiffer(a: MenuNumbers, b: MenuNumbers): boolean {
  if (a.menus.length !== b.menus.length) return true;
  if ((a.noMeal ?? 0) !== (b.noMeal ?? 0)) return true;
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
  allergy_summary: string | null;
  allergy_notes: AllergyNoteGroup[] | null;
  /** 0181; missing when the select predates it. */
  no_meal_count?: number | null;
  /** 0182; missing when the select predates it. */
  estimated_counts?: Record<string, number> | null;
  estimated_total?: number | null;
  /** 0184; missing when the select predates it. */
  estimated_people?: number | null;
};

function toEstimate(counts: Record<string, number> | null, total: number, titles: Record<string, string>): MenuEstimate | null {
  if (!counts || total <= 0) return null;
  const menus = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, name: titles[id] ?? "", count }))
    .sort((a, b) => a.name.localeCompare(b.name, "mk") || a.id.localeCompare(b.id));
  return { menus, total };
}

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
    numbers: { menus, total: row.total, noMeal: row.no_meal_count ?? 0 },
    estimate: toEstimate(row.estimated_counts ?? null, row.estimated_total ?? 0, titles),
    seenAt: row.seen_at,
    seenBy: row.seen_by,
    source: row.source,
    unanswered: row.unanswered,
    estimatedPeople: row.estimated_people ?? null,
    allergySummary: row.allergy_summary,
    allergyNotes: row.allergy_notes,
  };
}

/** The latest sending is waiting for the venue's Видено. */
export function hasUnseenMenuNumbers(n: { latest: MenuSubmission | null }): boolean {
  return n.latest !== null && n.latest.seenAt === null;
}

/** "од кои проценка: 24" — how every screen marks the estimated part. */
export function estimateNote(n: number): string {
  return `од кои проценка: ${n}`;
}

/** One menu's sent count: the real one plus its estimated part (if any). */
export function sentMenuCount(s: Pick<MenuSubmission, "estimate">, menuId: string, real: number): { count: number; estimated: number } {
  const estimated = s.estimate?.menus.find((m) => m.id === menuId)?.count ?? 0;
  return { count: real + estimated, estimated };
}

/** A sending's menus with the estimate folded in (an estimated-only menu included), each with its estimated part. */
export function sentMenus(s: Pick<MenuSubmission, "numbers" | "estimate">): { id: string; name: string; count: number; estimated: number }[] {
  const out = s.numbers.menus.map((m) => ({ id: m.id, name: m.name, ...sentMenuCount(s, m.id, m.count) }));
  for (const e of s.estimate?.menus ?? []) {
    if (!out.some((m) => m.id === e.id)) out.push({ id: e.id, name: e.name, count: e.count, estimated: e.count });
  }
  return out;
}

/** Meals sent, the estimate included. */
export function sentMeals(s: Pick<MenuSubmission, "numbers" | "estimate">): number {
  return s.numbers.total + (s.estimate?.total ?? 0);
}

/** The people at the tables per a sending: meals (real + estimate) plus the no-meal children. */
export function sentHeadcount(s: Pick<MenuSubmission, "numbers" | "estimate">): number {
  return sentMeals(s) + (s.numbers.noMeal ?? 0);
}

/**
 * The prefilled estimate (decision 9): `people` still without an answer,
 * split across the menus in the proportions of the real counts so far
 * (evenly when nothing is counted yet), rounded by largest remainder so the
 * parts add up to `people` exactly. Ties go to the earlier menu.
 */
export function prefillEstimate(menus: readonly { id: string; count: number }[], people: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (menus.length === 0) return out;
  const n = Math.max(0, Math.floor(people));
  const sum = menus.reduce((acc, m) => acc + Math.max(0, m.count), 0);
  const weights = menus.map((m) => (sum > 0 ? Math.max(0, m.count) / sum : 1 / menus.length));
  const exact = weights.map((w) => w * n);
  const floors = exact.map(Math.floor);
  let left = n - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, rem: x - floors[i] })).sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  menus.forEach((m, i) => (out[m.id] = floors[i]));
  return out;
}

/** What a sending told the venue, as plain numbers: each menu real + estimate, meals in `total`. */
export function sentNumbers(s: Pick<MenuSubmission, "numbers" | "estimate">): MenuNumbers {
  const menus = sentMenus(s).map(({ id, name, count }) => ({ id, name, count }));
  return { menus, total: sentMeals(s), noMeal: s.numbers.noMeal ?? 0 };
}

/**
 * The numbers to compare with a sending that carried an estimate (0184):
 * the real counts now, plus what is left of the estimate. The estimate
 * stood for `estimatedPeople` people still without an answer; as they
 * answer it shrinks in proportion to who is still unanswered (never above
 * what was sent), split across the menus as the sent estimate was. So a
 * guest from the estimated group confirming moves nothing in total — they
 * were already counted — while new guests, declines and changed menus do.
 * Without an estimate this is just `current`.
 */
export function withRemainingEstimate(
  current: MenuNumbers,
  latest: Pick<MenuSubmission, "estimate" | "estimatedPeople">,
  unansweredPeopleNow: number,
): MenuNumbers {
  const estimate = latest.estimate;
  if (!estimate || estimate.total <= 0) return current;
  const people = latest.estimatedPeople ?? 0;
  const unanswered = Math.max(0, unansweredPeopleNow);
  const left = Math.min(estimate.total, people > 0 ? Math.round((estimate.total * unanswered) / people) : unanswered);
  const split = prefillEstimate(estimate.menus, left);
  const menus = current.menus.map((m) => ({ ...m, count: m.count + (split[m.id] ?? 0) }));
  for (const e of estimate.menus) {
    if (!menus.some((m) => m.id === e.id) && (split[e.id] ?? 0) > 0) menus.push({ id: e.id, name: e.name, count: split[e.id] });
  }
  return { menus, total: menus.reduce((sum, m) => sum + m.count, 0), noMeal: current.noMeal ?? 0 };
}
