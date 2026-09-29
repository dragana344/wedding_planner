import { log } from "@/lib/log";

// PERF-002: every list of a user-growable table is explicitly bounded.
// Supabase's API returns at most 1000 rows per request (project setting
// "Max rows"), so without an explicit bound a longer list would be cut
// silently. Realistic maxima are far below (a large wedding ~500 guests);
// reaching the bound logs a warning so it is noticed before users are.
export const MAX_LIST_ROWS = 1000;

export function checkListBound<T>(rows: T[] | null, list: string): T[] {
  const out = rows ?? [];
  if (out.length >= MAX_LIST_ROWS) log("warn", "list_bound_reached", { list, max: MAX_LIST_ROWS });
  return out;
}
