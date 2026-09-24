import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";

export type FixedElementType = "wall" | "pillar" | "door" | "bar_fixed" | "other";

export interface FixedElement {
  id: string;
  room_id: string;
  element_type: FixedElementType;
  x_cm: number;
  y_cm: number;
  width_cm: number;
  height_cm: number;
  rotation_deg: number;
  label: string | null;
}

export interface FixedElementInput {
  room_id: string;
  element_type: FixedElementType;
  x_cm: number;
  y_cm: number;
  width_cm: number;
  height_cm: number;
  label?: string | null;
}

const FIXED_ELEMENT_COLUMNS = "id, room_id, element_type, x_cm, y_cm, width_cm, height_cm, rotation_deg, label";

export async function listFixedElements(
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<FixedElement[]> {
  const { data, error } = await client
    .from("room_fixed_elements")
    .select(FIXED_ELEMENT_COLUMNS)
    .eq("room_id", roomId);
  if (error) throw error;
  return data;
}

export async function addFixedElement(input: FixedElementInput): Promise<FixedElement> {
  const { data, error } = await resolveSupabaseClient()
    .from("room_fixed_elements")
    .insert(input)
    .select(FIXED_ELEMENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateFixedElementPosition(
  id: string,
  xCm: number,
  yCm: number
): Promise<FixedElement> {
  const { data, error } = await resolveSupabaseClient()
    .from("room_fixed_elements")
    .update({ x_cm: xCm, y_cm: yCm })
    .eq("id", id)
    .select(FIXED_ELEMENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateFixedElementSize(
  id: string,
  widthCm: number,
  heightCm: number
): Promise<FixedElement> {
  const { data, error } = await resolveSupabaseClient()
    .from("room_fixed_elements")
    .update({ width_cm: widthCm, height_cm: heightCm })
    .eq("id", id)
    .select(FIXED_ELEMENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateFixedElementRotation(id: string, rotationDeg: number): Promise<FixedElement> {
  const { data, error } = await resolveSupabaseClient()
    .from("room_fixed_elements")
    .update({ rotation_deg: rotationDeg })
    .eq("id", id)
    .select(FIXED_ELEMENT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFixedElement(id: string): Promise<void> {
  const { error } = await resolveSupabaseClient().from("room_fixed_elements").delete().eq("id", id);
  if (error) throw error;
}

export const FIXED_TYPE_COLORS: Record<FixedElementType, string> = {
  wall: "#525252",
  pillar: "#F97316",
  door: "#A3A3A3",
  bar_fixed: "#78350F",
  other: "#737373",
};

export async function verifyLayoutLockPassword(
  venueId: string,
  password: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<boolean> {
  const { data, error } = await client.rpc("verify_venue_layout_password", {
    p_venue_id: venueId,
    p_password: password,
  });
  if (error) throw error;
  return data as boolean;
}

export async function setLayoutLockPassword(
  venueId: string,
  newPassword: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  const { data, error } = await client.rpc("set_venue_layout_password", {
    p_venue_id: venueId,
    p_password: newPassword,
  });
  if (error) throw error;
  if (!data) throw new Error("Not authorized to change this venue's layout lock password.");
}

export async function updateRoomDimensions(
  roomId: string,
  widthCm: number,
  heightCm: number
): Promise<void> {
  const { error } = await resolveSupabaseClient()
    .from("rooms")
    .update({ width_cm: widthCm, height_cm: heightCm })
    .eq("id", roomId);
  if (error) throw error;
}

export type LayoutElementType = "table" | "stage" | "dance_floor" | "bar_movable" | "other";

export const MOVABLE_TYPE_COLORS: Record<LayoutElementType, string> = {
  table: "#3B82F6",
  stage: "#1F2937",
  dance_floor: "#7C3AED",
  bar_movable: "#78350F",
  other: "#737373",
};

export interface RoomLayoutElement {
  id: string;
  room_id: string;
  element_type: LayoutElementType;
  table_type_id: string | null;
  x_cm: number;
  y_cm: number;
  width_cm: number;
  length_cm: number;
  rotation_deg: number;
  label: string | null;
  created_at: string;
}

export interface RoomLayoutElementInput {
  room_id: string;
  element_type: LayoutElementType;
  table_type_id?: string | null;
  x_cm: number;
  y_cm: number;
  width_cm: number;
  length_cm: number;
  label?: string | null;
}

const ROOM_LAYOUT_COLUMNS =
  "id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm, rotation_deg, label, created_at";

export async function listRoomLayoutElements(
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<RoomLayoutElement[]> {
  const { data, error } = await client
    .from("room_layout_elements")
    .select(ROOM_LAYOUT_COLUMNS)
    .eq("room_id", roomId)
    // id is a tiebreaker: rows added in the same bulk insert (e.g. demo
    // seeding) can share an identical created_at timestamp, and Postgres
    // does not guarantee a stable order across equal sort keys — without
    // this, table numbers could silently reshuffle between refetches.
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Assigns each table a stable, staff-facing number (1, 2, 3, ...) based on
 * the order it was first placed on the grid — not its current position — so
 * the number stays put as staff drag the table around later. Non-table
 * elements (stage, bar, dance floor) are never numbered.
 */
export function numberTables(elements: RoomLayoutElement[]): Map<string, number> {
  const tables = elements
    .filter((el) => el.element_type === "table")
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const numbers = new Map<string, number>();
  tables.forEach((el, i) => numbers.set(el.id, i + 1));
  return numbers;
}

export async function addRoomLayoutElement(input: RoomLayoutElementInput): Promise<RoomLayoutElement> {
  const { data, error } = await resolveSupabaseClient()
    .from("room_layout_elements")
    .insert(input)
    .select(ROOM_LAYOUT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateRoomLayoutElementPosition(
  id: string,
  xCm: number,
  yCm: number
): Promise<RoomLayoutElement> {
  const { data, error } = await resolveSupabaseClient()
    .from("room_layout_elements")
    .update({ x_cm: xCm, y_cm: yCm })
    .eq("id", id)
    .select(ROOM_LAYOUT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateRoomLayoutElementSize(
  id: string,
  widthCm: number,
  lengthCm: number
): Promise<RoomLayoutElement> {
  const { data, error } = await resolveSupabaseClient()
    .from("room_layout_elements")
    .update({ width_cm: widthCm, length_cm: lengthCm })
    .eq("id", id)
    .select(ROOM_LAYOUT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateRoomLayoutElementRotation(id: string, rotationDeg: number): Promise<RoomLayoutElement> {
  const { data, error } = await resolveSupabaseClient()
    .from("room_layout_elements")
    .update({ rotation_deg: rotationDeg })
    .eq("id", id)
    .select(ROOM_LAYOUT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRoomLayoutElement(id: string): Promise<void> {
  const { error } = await resolveSupabaseClient().from("room_layout_elements").delete().eq("id", id);
  if (error) throw error;
}

export interface EventLayoutElement {
  id: string;
  event_id: string;
  room_id: string;
  element_type: LayoutElementType;
  table_type_id: string | null;
  x_cm: number;
  y_cm: number;
  width_cm: number;
  length_cm: number;
  rotation_deg: number;
  label: string | null;
}

export interface EventLayoutElementInput {
  event_id: string;
  room_id: string;
  element_type: LayoutElementType;
  table_type_id?: string | null;
  x_cm: number;
  y_cm: number;
  width_cm: number;
  length_cm: number;
  label?: string | null;
}

const EVENT_LAYOUT_COLUMNS =
  "id, event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm, rotation_deg, label";

export async function listEventLayoutElements(
  eventId: string,
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<EventLayoutElement[]> {
  const { data, error } = await client
    .from("event_layout_elements")
    .select(EVENT_LAYOUT_COLUMNS)
    .eq("event_id", eventId)
    .eq("room_id", roomId);
  if (error) throw error;
  return data;
}

export async function addEventLayoutElement(
  input: EventLayoutElementInput,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<EventLayoutElement> {
  const { data, error } = await client
    .from("event_layout_elements")
    .insert(input)
    .select(EVENT_LAYOUT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateEventLayoutElementPosition(
  id: string,
  xCm: number,
  yCm: number,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<EventLayoutElement> {
  const { data, error } = await client
    .from("event_layout_elements")
    .update({ x_cm: xCm, y_cm: yCm })
    .eq("id", id)
    .select(EVENT_LAYOUT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateEventLayoutElementSize(
  id: string,
  widthCm: number,
  lengthCm: number,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<EventLayoutElement> {
  const { data, error } = await client
    .from("event_layout_elements")
    .update({ width_cm: widthCm, length_cm: lengthCm })
    .eq("id", id)
    .select(EVENT_LAYOUT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateEventLayoutElementRotation(
  id: string,
  rotationDeg: number,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<EventLayoutElement> {
  const { data, error } = await client
    .from("event_layout_elements")
    .update({ rotation_deg: rotationDeg })
    .eq("id", id)
    .select(EVENT_LAYOUT_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteEventLayoutElement(
  id: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  const { error } = await client.from("event_layout_elements").delete().eq("id", id);
  if (error) throw error;
}

async function copyRoomLayoutToEvent(
  eventId: string,
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<EventLayoutElement[]> {
  const roomElements = await listRoomLayoutElements(roomId, client);
  if (roomElements.length === 0) return [];
  const { data, error } = await client
    .from("event_layout_elements")
    .insert(
      roomElements.map((el) => ({
        event_id: eventId,
        room_id: roomId,
        element_type: el.element_type,
        table_type_id: el.table_type_id,
        x_cm: el.x_cm,
        y_cm: el.y_cm,
        width_cm: el.width_cm,
        length_cm: el.length_cm,
        rotation_deg: el.rotation_deg,
        label: el.label,
      }))
    )
    .select(EVENT_LAYOUT_COLUMNS);
  if (error) throw error;
  return data;
}

export async function initializeEventLayoutFromStandard(
  eventId: string,
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<EventLayoutElement[]> {
  // Atomic claim: two concurrent calls for the same event+room (e.g. two
  // overlapping requests to the couple's seating page) must not both copy
  // the standard layout in — that duplicates every element at identical
  // coordinates. Only the caller that flips layout_initialized_at from null
  // proceeds to copy; the loser just reads whatever is there.
  const { data: claimed, error: claimError } = await client
    .from("event_rooms")
    .update({ layout_initialized_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("room_id", roomId)
    .is("layout_initialized_at", null)
    .select("room_id");
  if (claimError) throw claimError;

  if (!claimed || claimed.length === 0) {
    // Already claimed — either a concurrent call is copying right now, or
    // this room was initialized before. Either way, do not copy again.
    return listEventLayoutElements(eventId, roomId, client);
  }

  const existing = await listEventLayoutElements(eventId, roomId, client);
  if (existing.length > 0) return existing;
  return copyRoomLayoutToEvent(eventId, roomId, client);
}

export async function revertEventLayoutToStandard(
  eventId: string,
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<EventLayoutElement[]> {
  const { error: deleteError } = await client
    .from("event_layout_elements")
    .delete()
    .eq("event_id", eventId)
    .eq("room_id", roomId);
  if (deleteError) throw deleteError;
  return copyRoomLayoutToEvent(eventId, roomId, client);
}

export async function captureEventLayoutSnapshot(
  eventId: string,
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  const elements = await listEventLayoutElements(eventId, roomId, client);
  const { data: event, error: fetchError } = await client
    .from("events")
    .select("layout_undo_snapshot")
    .eq("id", eventId)
    .single();
  if (fetchError) throw fetchError;
  const snapshotMap = (event.layout_undo_snapshot as Record<string, EventLayoutElement[]> | null) ?? {};
  const updatedSnapshotMap = { ...snapshotMap, [roomId]: elements };
  const { error } = await client.from("events").update({ layout_undo_snapshot: updatedSnapshotMap }).eq("id", eventId);
  if (error) throw error;
}

export async function undoEventLayout(
  eventId: string,
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<EventLayoutElement[]> {
  const { data: event, error: fetchError } = await client
    .from("events")
    .select("layout_undo_snapshot")
    .eq("id", eventId)
    .single();
  if (fetchError) throw fetchError;

  const snapshotMap = event.layout_undo_snapshot as Record<string, EventLayoutElement[]> | null;
  const snapshot = snapshotMap?.[roomId];
  if (!snapshot) {
    throw new Error("No undo snapshot available for this event.");
  }

  const { error: deleteError } = await client
    .from("event_layout_elements")
    .delete()
    .eq("event_id", eventId)
    .eq("room_id", roomId);
  if (deleteError) throw deleteError;

  let restored: EventLayoutElement[] = [];
  if (snapshot.length > 0) {
    const { data, error: insertError } = await client
      .from("event_layout_elements")
      .insert(
        snapshot.map((el) => ({
          event_id: eventId,
          room_id: roomId,
          element_type: el.element_type,
          table_type_id: el.table_type_id,
          x_cm: el.x_cm,
          y_cm: el.y_cm,
          width_cm: el.width_cm,
          length_cm: el.length_cm,
          rotation_deg: el.rotation_deg,
          label: el.label,
        }))
      )
      .select(EVENT_LAYOUT_COLUMNS);
    if (insertError) throw insertError;
    restored = data;
  }

  const remainingSnapshotMap = { ...snapshotMap };
  delete remainingSnapshotMap[roomId];
  const { error: clearError } = await client.from("events").update({ layout_undo_snapshot: remainingSnapshotMap }).eq("id", eventId);
  if (clearError) throw clearError;

  return restored;
}
