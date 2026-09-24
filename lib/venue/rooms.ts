import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";

export interface Room {
  id: string;
  venue_id: string;
  name: string;
  width_cm: number;
  height_cm: number;
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
    .select("id, venue_id, name, width_cm, height_cm")
    .eq("venue_id", venueId)
    .order("name");
  if (error) throw error;
  return data;
}

export async function createRoom(venueId: string, name: string): Promise<Room> {
  const { data, error } = await resolveSupabaseClient()
    .from("rooms")
    .insert({ venue_id: venueId, name })
    .select("id, venue_id, name, width_cm, height_cm")
    .single();
  if (error) throw error;
  return data;
}

export async function updateRoomName(roomId: string, name: string): Promise<Room> {
  const { data, error } = await resolveSupabaseClient()
    .from("rooms")
    .update({ name })
    .eq("id", roomId)
    .select("id, venue_id, name, width_cm, height_cm")
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
    .select("id, venue_id, name, width_cm, height_cm, table_types(seats, quantity)")
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
    .select("id, venue_id, name, width_cm, height_cm")
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

export async function deleteRoom(roomId: string): Promise<void> {
  const { error } = await resolveSupabaseClient().from("rooms").delete().eq("id", roomId);
  if (error) throw error;
}
