import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoomSeating, Seat, SeatTable } from "./types";
import { seatFlags, type SeatFlag } from "./flags";

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

type FlagRow = { guest_id: string; full_name: string; rsvp_status: string; party_size: number; seats_taken: number };

/**
 * 0181: the seated guests' answers and party sizes (event_seat_guest_flags,
 * readable by staff) turned into the plan's flags. Only a hint: a failed read
 * shows none.
 */
async function staffSeatFlags(client: SupabaseClient, eventId: string, seats: Seat[], tables: SeatTable[]): Promise<SeatFlag[]> {
  try {
    const { data, error } = await client.rpc("event_seat_guest_flags", { p_event_id: eventId });
    if (error) throw error;
    const rows = (data ?? []) as FlagRow[];
    return seatFlags(
      rows.map((r) => ({ id: r.guest_id, fullName: r.full_name, rsvpStatus: r.rsvp_status, partySize: r.party_size, seatsTaken: r.seats_taken })),
      seats,
      tables,
    );
  } catch {
    return [];
  }
}

/** Venue staff's read-only view (RLS client). Staff cannot read the guest list, so `guests` is empty; the flags come from their own read. */
export async function getRoomSeatingForStaff(client: SupabaseClient, eventId: string, roomId: string): Promise<RoomSeating> {
  const { tables, seats } = await readRoom(client, eventId, roomId, "event_room_tables_for_staff");
  return { tables, seats, guests: [], flags: await staffSeatFlags(client, eventId, seats, tables) };
}

