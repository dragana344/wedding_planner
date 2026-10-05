// lib/venue/reservations.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";
import type { EventType } from "./events";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";

/**
 * Arrival-based lifecycle: reserved (booked, guests not here yet) -> seated
 * (guests physically at the table, set by staff when they arrive) ->
 * completed (guests left, set by staff) -> cancelled (never happened).
 */
export type ReservationStatus = "reserved" | "seated" | "completed" | "cancelled";

export interface Reservation {
  id: string;
  venue_id: string;
  room_id: string;
  guest_name: string;
  phone: string;
  email: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  party_size: number;
  status: ReservationStatus;
  event_type: EventType | null;
  note: string | null;
  table_ids: string[];
}

export interface ReservationInput {
  venue_id: string;
  room_id: string;
  guest_name: string;
  phone: string;
  email?: string | null;
  date: string;
  start_time: string;
  end_time?: string | null;
  party_size: number;
  status?: ReservationStatus;
  event_type?: EventType | null;
  note?: string | null;
  table_ids: string[];
}

export const RESERVATION_STATUS_META: Record<
  ReservationStatus,
  { label: string; pill: "p-ok" | "p-warn" | "p-info" | "p-bad" }
> = {
  reserved: { label: "Резервирано", pill: "p-info" },
  // Deliberately distinct wording from the "Зафатена"/"Слободна" toggle
  // button text (which flips based on THIS status) — sharing exact words
  // caused duplicate-text collisions when both a pill and a button for a
  // different row render "Зафатена"/"Слободна" in the same list.
  seated: { label: "Присутни гости", pill: "p-warn" },
  completed: { label: "Завршена", pill: "p-ok" },
  cancelled: { label: "Откажана", pill: "p-bad" },
};

/** Reservations in these statuses no longer occupy a table. */
const INACTIVE_STATUSES: ReservationStatus[] = ["cancelled", "completed"];

const RESERVATION_COLUMNS =
  "id, venue_id, room_id, guest_name, phone, email, date, start_time, end_time, party_size, status, event_type, note, reservation_tables(layout_element_id)";

interface ReservationRow {
  id: string;
  venue_id: string;
  room_id: string;
  guest_name: string;
  phone: string;
  email: string | null;
  date: string;
  start_time: string;
  end_time: string | null;
  party_size: number;
  status: ReservationStatus;
  event_type: EventType | null;
  note: string | null;
  reservation_tables: { layout_element_id: string }[] | null;
}

function mapRow(row: ReservationRow): Reservation {
  return {
    id: row.id,
    venue_id: row.venue_id,
    room_id: row.room_id,
    guest_name: row.guest_name,
    phone: row.phone,
    email: row.email,
    date: row.date,
    start_time: row.start_time,
    end_time: row.end_time,
    party_size: row.party_size,
    status: row.status,
    event_type: row.event_type,
    note: row.note,
    table_ids: (row.reservation_tables ?? []).map((t) => t.layout_element_id),
  };
}

export async function listReservations(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<Reservation[]> {
  const { data, error } = await client
    .from("reservations")
    .select(RESERVATION_COLUMNS)
    .eq("venue_id", venueId)
    .order("date", { ascending: false })
    .order("start_time", { ascending: true })
    .limit(MAX_LIST_ROWS); // newest first, so older history is what a bound drops
  if (error) throw error;
  return checkListBound(data, "reservations").map(mapRow);
}

export async function listReservationsForDate(
  venueId: string,
  date: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<Reservation[]> {
  const { data, error } = await client
    .from("reservations")
    .select(RESERVATION_COLUMNS)
    .eq("venue_id", venueId)
    .eq("date", date)
    .order("start_time", { ascending: true })
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function listReservationsForRoom(
  roomId: string,
  date: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<Reservation[]> {
  const { data, error } = await client
    .from("reservations")
    .select(RESERVATION_COLUMNS)
    .eq("room_id", roomId)
    .eq("date", date)
    .not("status", "in", `(${INACTIVE_STATUSES.join(",")})`)
    .order("start_time", { ascending: true })
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  return (data ?? []).map(mapRow);
}

/** How long a table stays reserved when a booking has no explicit end time. */
const DEFAULT_RESERVATION_MINUTES = 180;

/**
 * How close to an upcoming reservation's start a candidate time has to be
 * before the floor plan calls the table "reserved" (red) rather than merely
 * "limited" (yellow) — see `getTableAvailability`.
 */
const PROXIMITY_BLOCK_MINUTES = 60;

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function expandRange(start: string, end: string | null): { s: number; e: number } {
  const s = toMinutes(start);
  let e = end ? toMinutes(end) : s + DEFAULT_RESERVATION_MINUTES;
  if (e <= s) e += 24 * 60;
  return { s, e };
}

/**
 * Whether two [start, end) windows on the same `date` overlap. A missing end
 * time is treated as a nominal 3-hour block. An end time at or before the
 * start time is treated as crossing midnight, adding 24h — the same
 * convention migration 0015 established for events.
 *
 * Two DIFFERENT reservations, not just one record's own start/end, can be
 * adjacent across a midnight boundary (e.g. a 22:00-02:00 booking and a
 * separate 01:00-03:00 booking recorded under the same `date` really do
 * overlap). Checking b against a at three offsets (-24h, 0, +24h) correctly
 * catches this without needing to guess which record "really" spans the
 * boundary.
 */
export function rangesOverlap(aStart: string, aEnd: string | null, bStart: string, bEnd: string | null): boolean {
  const a = expandRange(aStart, aEnd);
  const b = expandRange(bStart, bEnd);
  for (const shiftMinutes of [-24 * 60, 0, 24 * 60]) {
    const bs = b.s + shiftMinutes;
    const be = b.e + shiftMinutes;
    if (a.s < be && a.e > bs) return true;
  }
  return false;
}

/** Whole-day index for a "YYYY-MM-DD" date string, for unambiguous date arithmetic. */
function toDayIndex(date: string): number {
  return Math.round(new Date(`${date}T00:00:00Z`).getTime() / 86400000);
}

/** "YYYY-MM-DD" date shifted by deltaDays (may be negative). */
function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * A reservation's true, unambiguous absolute span in minutes, anchored to
 * its own date. Used only for cross-date comparisons, where there's no
 * "which night does this early time belong to" ambiguity to resolve (that
 * ambiguity only exists when comparing two records sharing the SAME date
 * value — see rangesOverlap for that case).
 */
function absoluteSpan(date: string, start: string, end: string | null): { s: number; e: number } {
  const day = toDayIndex(date);
  const s = day * 1440 + toMinutes(start);
  let e = end ? day * 1440 + toMinutes(end) : s + DEFAULT_RESERVATION_MINUTES;
  if (e <= s) e += 24 * 60;
  return { s, e };
}

/**
 * Whether two reservations (each identified by its own date + time window)
 * overlap in real-world time. Same-date comparisons defer to rangesOverlap
 * (which resolves the early-time ambiguity per Task 2's established
 * convention); different-date comparisons use an unambiguous absolute-time
 * check instead, since dates more than 1 day apart can never overlap given
 * the ~28h maximum span a single reservation can have, and adjacent dates
 * need the true anchored comparison, not the same-date heuristic (which
 * would produce false positives across genuinely different days).
 */
function reservationsOverlap(
  aDate: string,
  aStart: string,
  aEnd: string | null,
  bDate: string,
  bStart: string,
  bEnd: string | null
): boolean {
  if (aDate === bDate) {
    return rangesOverlap(aStart, aEnd, bStart, bEnd);
  }
  if (Math.abs(toDayIndex(aDate) - toDayIndex(bDate)) > 1) {
    return false;
  }
  const a = absoluteSpan(aDate, aStart, aEnd);
  const b = absoluteSpan(bDate, bStart, bEnd);
  return a.s < b.e && a.e > b.s;
}

export async function findConflictingTables(
  roomId: string,
  date: string,
  startTime: string,
  endTime: string | null,
  tableIds: string[],
  excludeReservationId: string | null,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<string[]> {
  const candidateDates = [shiftDate(date, -1), date, shiftDate(date, 1)];
  const candidateLists = await Promise.all(
    candidateDates.map((d) => listReservationsForRoom(roomId, d, client))
  );
  const existing = candidateLists.flat();
  const conflicting = new Set<string>();
  for (const r of existing) {
    if (excludeReservationId && r.id === excludeReservationId) continue;
    // A seated party is physically at the table, regardless of what the
    // assumed time window says — but only on its own day. A reservation
    // nobody marked as left must not keep its tables blocked on the days
    // after; from then on only its real time window counts.
    const blocks =
      (r.status === "seated" && r.date === date) ||
      reservationsOverlap(date, startTime, endTime, r.date, r.start_time, r.end_time);
    if (!blocks) continue;
    for (const tableId of r.table_ids) {
      if (tableIds.includes(tableId)) conflicting.add(tableId);
    }
  }
  return Array.from(conflicting);
}

export interface TableAvailability {
  /** Genuinely occupied right now, or an upcoming reservation starts within
   * PROXIMITY_BLOCK_MINUTES — shown red on the floor plan. */
  reserved: string[];
  /** Free at the selected time, but an upcoming reservation starts within
   * DEFAULT_RESERVATION_MINUTES — shown yellow: bookable, but tight. */
  limited: string[];
}

/**
 * Purely advisory, floor-plan-facing table status for a candidate (date,
 * startTime) — NOT used to gate submission (createReservation always runs
 * its own accurate findConflictingTables check regardless of this). This
 * only tiers what's already free into "reserved soon" vs "free with room to
 * spare", so staff aren't misled into thinking a table is wide open when
 * another party is due in the next couple of hours.
 */
export async function getTableAvailability(
  roomId: string,
  date: string,
  startTime: string,
  tableIds: string[],
  excludeReservationId: string | null,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<TableAvailability> {
  const candidateDates = [shiftDate(date, -1), date, shiftDate(date, 1)];
  const candidateLists = await Promise.all(
    candidateDates.map((d) => listReservationsForRoom(roomId, d, client))
  );
  const existing = candidateLists.flat();
  const candidateStart = absoluteSpan(date, startTime, null).s;

  const reserved = new Set<string>();
  const limited = new Set<string>();
  for (const r of existing) {
    if (excludeReservationId && r.id === excludeReservationId) continue;
    const rSpan = absoluteSpan(r.date, r.start_time, r.end_time);
    const occupiedNow = candidateStart >= rSpan.s && candidateStart < rSpan.e;
    const minutesUntilStart = rSpan.s - candidateStart;
    for (const tableId of r.table_ids) {
      if (!tableIds.includes(tableId)) continue;
      // A seated party occupies the table on its own day — no tiering.
      if (
        (r.status === "seated" && r.date === date) ||
        occupiedNow ||
        (minutesUntilStart >= 0 && minutesUntilStart < PROXIMITY_BLOCK_MINUTES)
      ) {
        reserved.add(tableId);
      } else if (minutesUntilStart >= 0 && minutesUntilStart < DEFAULT_RESERVATION_MINUTES) {
        limited.add(tableId);
      }
    }
  }
  for (const tableId of Array.from(reserved)) limited.delete(tableId);
  return { reserved: Array.from(reserved), limited: Array.from(limited) };
}

const TABLE_CONFLICT_MESSAGE = "Една или повеќе од избраните маси се веќе резервирани за тоа време.";

export async function createReservation(
  input: ReservationInput,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<Reservation> {
  const conflicts = await findConflictingTables(
    input.room_id,
    input.date,
    input.start_time,
    input.end_time ?? null,
    input.table_ids,
    null,
    client
  );
  if (conflicts.length > 0) {
    throw new Error(TABLE_CONFLICT_MESSAGE);
  }

  const { data: reservation, error } = await client
    .from("reservations")
    .insert({
      venue_id: input.venue_id,
      room_id: input.room_id,
      guest_name: input.guest_name,
      phone: input.phone,
      email: input.email ?? null,
      date: input.date,
      start_time: input.start_time,
      end_time: input.end_time ?? null,
      party_size: input.party_size,
      status: input.status ?? "reserved",
      event_type: input.event_type ?? null,
      note: input.note ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;

  if (input.table_ids.length > 0) {
    const { error: tablesError } = await client
      .from("reservation_tables")
      .insert(input.table_ids.map((layout_element_id) => ({ reservation_id: reservation.id, layout_element_id })));
    if (tablesError) {
      // The reservations row already committed but has no tables attached —
      // delete it so a failed createReservation call never leaves an
      // orphaned row behind.
      await client.from("reservations").delete().eq("id", reservation.id);
      // The database's no-overlap constraint (migration 0035) caught a
      // booking that raced ours past the check above: 23P01, or 40P01 when
      // both inserts were in flight at once and each waited on the other.
      if (tablesError.code === "23P01" || tablesError.code === "40P01") throw new Error(TABLE_CONFLICT_MESSAGE);
      throw tablesError;
    }
  }

  const { data, error: fetchError } = await client
    .from("reservations")
    .select(RESERVATION_COLUMNS)
    .eq("id", reservation.id)
    .single();
  if (fetchError) throw fetchError;
  return mapRow(data);
}

export async function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  const { error } = await client.from("reservations").update({ status }).eq("id", reservationId);
  if (error) throw error;
}

/**
 * Permanently removes a reservation (and its table assignments, via
 * cascade) — used when a reservation is cancelled or the table is freed up
 * after guests leave. There is no "completed"/"cancelled" resting state:
 * once resolved, the record is gone rather than kept around as history.
 */
export async function deleteReservation(
  reservationId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  const { error } = await client.from("reservations").delete().eq("id", reservationId);
  if (error) throw error;
}
