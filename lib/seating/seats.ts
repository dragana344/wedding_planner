import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Seat lists per table (event_seat_assignments, 0070/0071). Table numbers and
// capacities always come from the database (event_room_tables), so the
// couple, the venue and the guests see the same "Маса N".

import type { RoomSeating, SeatGuest, SeatInput } from "./types";

export type { RoomSeating, Seat, SeatGuest, SeatInput, SeatTable } from "./types";
export { tableTitle } from "./types";
export { getRoomSeatingForStaff } from "./read";
import { readRoom } from "./read";
import { captureCoupleSnapshot, pushCoupleHistory } from "@/lib/couple/seating";

async function assertRoomBelongsToEvent(client: SupabaseClient, eventId: string, roomId: string): Promise<void> {
  const { data, error } = await client
    .from("event_rooms")
    .select("room_id")
    .eq("event_id", eventId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Салата не е доделена на овој настан.");
}

/** The couple's view of one room: tables, seats and every guest with how many seats they hold (event-wide). */
export async function getRoomSeating(eventId: string, roomId: string): Promise<RoomSeating> {
  const client = createServiceRoleClient();
  await assertRoomBelongsToEvent(client, eventId, roomId);
  const [{ tables, seats }, guests, taken] = await Promise.all([
    readRoom(client, eventId, roomId, "event_room_tables"),
    client.from("event_guests").select("id, full_name, party_size, side").eq("event_id", eventId).order("full_name"),
    client.from("event_seat_assignments").select("guest_id").eq("event_id", eventId).not("guest_id", "is", null),
  ]);
  if (guests.error) throw guests.error;
  if (taken.error) throw taken.error;
  const counts = new Map<string, number>();
  for (const row of taken.data) counts.set(row.guest_id as string, (counts.get(row.guest_id as string) ?? 0) + 1);
  return {
    tables,
    seats,
    guests: guests.data.map((g) => ({
      id: g.id,
      fullName: g.full_name,
      partySize: g.party_size,
      seatsTaken: counts.get(g.id) ?? 0,
      side: (g.side as SeatGuest["side"]) ?? null,
    })),
  };
}

/** Replaces one table's seat list in one transaction. Blank seats are simply left out. */
export async function replaceTableSeats(
  eventId: string,
  roomId: string,
  elementId: string,
  seats: SeatInput[],
  { recordHistory = false, expected }: { recordHistory?: boolean; expected?: SeatInput[] } = {},
): Promise<void> {
  const client = createServiceRoleClient();
  await assertRoomBelongsToEvent(client, eventId, roomId);
  // The couple's saves are undo steps too, so undoing a later layout edit
  // does not silently drop them — recorded only once the save went through.
  const before = recordHistory ? await captureCoupleSnapshot(eventId, roomId, client) : null;
  const toRows = (list: SeatInput[]) =>
    list
      .map((s) => ({ seat_number: s.seatNumber, guest_id: s.guestId ?? null, guest_name: s.guestId ? null : s.guestName?.trim() || null }))
      .filter((s) => s.guest_id || s.guest_name);
  const rows = toRows(seats);
  const { error } = await client.rpc("replace_table_seats", {
    p_event_id: eventId,
    p_room_id: roomId,
    p_element_id: elementId,
    p_seats: rows,
    p_expected: expected ? toRows(expected) : null,
  });
  if (error) throw error;
  if (before) await pushCoupleHistory(eventId, roomId, before, client);
}

export const SEAT_LIST_CHANGED_ERROR = "Листата е сменета на друг уред. Освежете ја и обидете се повторно.";

const SEAT_HINT_MESSAGES: Record<string, string> = {
  over_capacity: "Столчето е надвор од масата.",
  party_full: "Гостинот веќе ги има сите свои места.",
  other_event: "Гостинот не е од овој настан.",
  no_table: "Масата повеќе ја нема во распоредот. Освежете.",
};

/**
 * The user-facing reason a seat write was refused (a 409), or null when the
 * error is not one the user caused: another device saved first (S3001), a
 * seat taken twice (23505), a guest gone (23503), or a seat trigger refusal
 * whose hint (0076) names the cause.
 */
export function seatConflictMessage(err: unknown): string | null {
  const { code, hint } = (err ?? {}) as { code?: string; hint?: string | null };
  if (code === "S3001") return SEAT_LIST_CHANGED_ERROR;
  if (code === "23505") return "Столчето е зафатено. Освежете.";
  if (code === "23503") return "Гостинот повеќе не е на листата. Освежете.";
  if (code === "23514") return (hint && SEAT_HINT_MESSAGES[hint]) || "Столчето не може да се зачува.";
  return null;
}
