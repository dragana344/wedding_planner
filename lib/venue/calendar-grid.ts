// Pure month-grid arithmetic for the event-wizard's date picker (no DOM, no
// jsdom-zeroed layout to worry about — same reasoning as zoom-to-fit.ts).

export interface CalendarCell {
  /** ISO yyyy-mm-dd, or null for a padding cell before day 1 / after the month's last day. */
  date: string | null;
}

const WEEKDAY_LABELS = ["Пон", "Вто", "Сре", "Чет", "Пет", "Саб", "Нед"] as const;

export { WEEKDAY_LABELS };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * A Monday-first grid of `year`/`month` (month is 0-indexed, matching
 * JS `Date`), padded with null cells so it always starts on a Monday —
 * the UI renders those as empty squares.
 */
export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun..6=Sat
  const leadingBlanks = (firstWeekday + 6) % 7; // Monday-first offset
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: CalendarCell[] = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push({ date: null });
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: `${year}-${pad2(month + 1)}-${pad2(day)}` });
  }
  return cells;
}

/** The [year, 0-indexed month] an ISO date (or today, if invalid/empty) falls in. */
export function monthOf(isoDate: string, today: string): [number, number] {
  const source = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate : today;
  const [y, m] = source.split("-").map(Number);
  return [y, m - 1];
}

/** The 0-indexed month shifted by `delta` months, wrapping the year. */
export function shiftMonth(year: number, month: number, delta: number): [number, number] {
  const total = year * 12 + month + delta;
  return [Math.floor(total / 12), ((total % 12) + 12) % 12];
}

const MONTH_LABELS_MK = [
  "Јануари", "Февруари", "Март", "Април", "Мај", "Јуни",
  "Јули", "Август", "Септември", "Октомври", "Ноември", "Декември",
] as const;

export function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS_MK[month]} ${year}`;
}

/** [first day, last day] of `year`/`month`, as ISO yyyy-mm-dd — the range to query booked dates for. */
export function monthRange(year: number, month: number): [string, string] {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [`${year}-${pad2(month + 1)}-01`, `${year}-${pad2(month + 1)}-${pad2(daysInMonth)}`];
}
