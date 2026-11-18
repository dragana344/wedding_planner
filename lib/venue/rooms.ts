import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";

export interface Room {
  id: string;
  venue_id: string;
  name: string;
  width_cm: number;
  height_cm: number;
  /** 0157: where the room is, when it differs from (or adds to) the venue's own address. */
  address?: string | null;
  map_url?: string | null;
}

const ROOM_COLUMNS = "id, venue_id, name, width_cm, height_cm, address, map_url";

export interface RoomPlaceInput {
  address?: string | null;
  map_url?: string | null;
}

export interface TableType {
  id: string;
  room_id: string;
  name: string;
  shape: "round" | "rectangular";
  seats: number;
  width_cm: number;
  length_cm: number;
  quantity: number;
}

export interface TableTypeInput {
  room_id: string;
  name: string;
  shape: "round" | "rectangular";
  seats: number;
  width_cm: number;
  length_cm: number;
  quantity: number;
}

export async function listRooms(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<Room[]> {
  const { data, error } = await client
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("venue_id", venueId)
    .order("name");
  if (error) throw error;
  return data;
}

export const ROOM_NAME_REQUIRED_ERROR = "Внесете име на просторијата.";

/** A name of only spaces passes the form's `required`, so it is checked here. */
function cleanRoomName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(ROOM_NAME_REQUIRED_ERROR);
  return trimmed;
}

export const ROOM_MAP_URL_ERROR = "Линкот до мапата мора да почнува со http:// или https://.";

/** Empty address/link become null; a link must be a web link. */
function cleanRoomPlace(place: RoomPlaceInput): { address: string | null; map_url: string | null } {
  const address = place.address?.trim() || null;
  const mapUrl = place.map_url?.trim() || null;
  if (mapUrl && !/^https?:\/\//i.test(mapUrl)) throw new Error(ROOM_MAP_URL_ERROR);
  return { address, map_url: mapUrl };
}

export async function createRoom(venueId: string, name: string, place: RoomPlaceInput = {}): Promise<Room> {
  const { data, error } = await resolveSupabaseClient()
    .from("rooms")
    .insert({ venue_id: venueId, name: cleanRoomName(name), ...cleanRoomPlace(place) })
    .select(ROOM_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateRoomName(roomId: string, name: string): Promise<Room> {
  const { data, error } = await resolveSupabaseClient()
    .from("rooms")
    .update({ name: cleanRoomName(name) })
    .eq("id", roomId)
    .select(ROOM_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** Name, address and map link of a room, saved together from the room's edit form. */
export async function updateRoomDetails(roomId: string, name: string, place: RoomPlaceInput): Promise<Room> {
  const { data, error } = await resolveSupabaseClient()
    .from("rooms")
    .update({ name: cleanRoomName(name), ...cleanRoomPlace(place) })
    .eq("id", roomId)
    .select(ROOM_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function listTableTypes(
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<TableType[]> {
  const { data, error } = await client
    .from("table_types")
    .select("id, room_id, name, shape, seats, width_cm, length_cm, quantity")
    .eq("room_id", roomId)
    .order("name");
  if (error) throw error;
  return data;
}

export interface RoomWithSeatTotal extends Room {
  tableTypeCount: number;
  seatTotal: number;
}

export async function listRoomsWithSeatTotals(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<RoomWithSeatTotal[]> {
  const { data, error } = await client
    .from("rooms")
    .select(`${ROOM_COLUMNS}, table_types(seats, quantity)`)
    .eq("venue_id", venueId)
    .order("name");
  if (error) throw error;

  return (data ?? []).map((room) => {
    const tableTypes = (room.table_types ?? []) as { seats: number; quantity: number }[];
    return {
      id: room.id,
      venue_id: room.venue_id,
      name: room.name,
      width_cm: room.width_cm,
      height_cm: room.height_cm,
      address: room.address,
      map_url: room.map_url,
      tableTypeCount: tableTypes.length,
      seatTotal: tableTypes.reduce((sum, t) => sum + t.seats * t.quantity, 0),
    };
  });
}

export async function getRoomById(
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<Room | null> {
  const { data, error } = await client
    .from("rooms")
    .select(ROOM_COLUMNS)
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertTableType(input: TableTypeInput): Promise<TableType> {
  const { data, error } = await resolveSupabaseClient()
    .from("table_types")
    .insert(input)
    .select("id, room_id, name, shape, seats, width_cm, length_cm, quantity")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTableType(tableTypeId: string, input: TableTypeInput): Promise<TableType> {
  const { data, error } = await resolveSupabaseClient()
    .from("table_types")
    .update(input)
    .eq("id", tableTypeId)
    .select("id, room_id, name, shape, seats, width_cm, length_cm, quantity")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTableType(tableTypeId: string): Promise<void> {
  const { error } = await resolveSupabaseClient().from("table_types").delete().eq("id", tableTypeId);
  if (error) throw error;
}

/**
 * What deleting a room takes with it (every table that references rooms
 * cascades): the events held in it, with their layout and seating there,
 * and its reservations from today on.
 */
export async function roomUsage(roomId: string, today: string): Promise<{ events: number; reservations: number }> {
  const client = resolveSupabaseClient();
  const [events, reservations] = await Promise.all([
    client.from("event_rooms").select("event_id", { count: "exact", head: true }).eq("room_id", roomId),
    // Only live bookings: cancelled/completed ones are kept as history (0174).
    client
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .gte("date", today)
      .not("status", "in", "(cancelled,completed)"),
  ]);
  if (events.error) throw events.error;
  if (reservations.error) throw reservations.error;
  return { events: events.count ?? 0, reservations: reservations.count ?? 0 };
}

export async function deleteRoom(roomId: string): Promise<void> {
  const { error } = await resolveSupabaseClient().from("rooms").delete().eq("id", roomId);
  if (error) throw error;
}

/** Seated guests a change to this table type would unseat (0076): those on seats above `seats`, or all when deleting (`null`). */
export async function seatsAffectedByTableType(tableTypeId: string, seats: number | null): Promise<number> {
  const { data, error } = await resolveSupabaseClient().rpc("seats_affected_by_table_type", {
    p_table_type_id: tableTypeId,
    p_seats: seats,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}
