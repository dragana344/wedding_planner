import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoomSeating, Seat, SeatTable } from "./types";

// Reads shared by the couple (service role, server) and venue staff (RLS
// client, browser or server): numbering comes from event_room_tables*.

type TableRow = { element_id: string; label: string | null; ord: number; capacity: number };
type SeatListRow = { element_id: string; seat_number: number; guest_id: string | null; display_name: string };

function toTables(rows: TableRow[]): SeatTable[] {
  return rows
    .map((r) => ({ elementId: r.element_id, label: r.label, number: r.ord, capacity: r.capacity }))
    .sort((a, b) => a.number - b.number);
}

function toSeats(rows: SeatListRow[]): Seat[] {
  return rows.map((r) => ({
    elementId: r.element_id,
    seatNumber: r.seat_number,
    guestId: r.guest_id,
    guestName: r.guest_id ? null : r.display_name,
    displayName: r.display_name,
  }));
}

export async function readRoom(client: SupabaseClient, eventId: string, roomId: string, tablesFn: string) {
  const [tables, seats] = await Promise.all([
    client.rpc(tablesFn, { p_event_id: eventId, p_room_id: roomId }),
    client.rpc("event_seat_list", { p_event_id: eventId, p_room_id: roomId }),
  ]);
  if (tables.error) throw tables.error;
  if (seats.error) throw seats.error;
  return { tables: toTables(tables.data as TableRow[]), seats: toSeats(seats.data as SeatListRow[]) };
}

/** Venue staff's read-only view (RLS client). Staff cannot read the guest list, so `guests` is empty. */
export async function getRoomSeatingForStaff(client: SupabaseClient, eventId: string, roomId: string): Promise<RoomSeating> {
  const { tables, seats } = await readRoom(client, eventId, roomId, "event_room_tables_for_staff");
  return { tables, seats, guests: [] };
}

