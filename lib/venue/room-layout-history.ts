import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";
import { listFixedElements, listRoomLayoutElements, type FixedElement, type RoomLayoutElement } from "./floorplan";
import {
  emptyRoomHistory,
  recordRoom,
  undoRoom,
  redoRoom,
  roomHistoryState,
  type RoomHistory,
  type RoomLayoutSnapshot,
} from "@/lib/seating/room-history";

// Multi-step undo/redo for the room floor-plan editor (RoomFloorPlanPage),
// mirroring lib/venue/floorplan-history.ts's staff event-layout store but
// scoped to a room instead of an event+room, with no seats to carry along.

export const ROOM_NOTHING_TO_UNDO = "Нема што да се врати.";
export const ROOM_NOTHING_TO_REDO = "Нема што да се повтори.";

async function readHistory(client: SupabaseClient, roomId: string): Promise<RoomHistory> {
  const { data, error } = await client.from("rooms").select("layout_history").eq("id", roomId).single();
  if (error) throw error;
  return data.layout_history ? (data.layout_history as RoomHistory) : emptyRoomHistory();
}

async function writeHistory(client: SupabaseClient, roomId: string, history: RoomHistory): Promise<void> {
  const { error } = await client.from("rooms").update({ layout_history: history }).eq("id", roomId);
  if (error) throw error;
}

async function snapshotRoom(client: SupabaseClient, roomId: string): Promise<RoomLayoutSnapshot> {
  const [elements, fixed] = await Promise.all([listRoomLayoutElements(roomId, client), listFixedElements(roomId, client)]);
  return { elements, fixed };
}

async function restoreRoom(
  client: SupabaseClient,
  roomId: string,
  snapshot: RoomLayoutSnapshot
): Promise<{ elements: RoomLayoutElement[]; fixed: FixedElement[] }> {
  const { error } = await client.rpc("restore_room_layout", {
    p_room_id: roomId,
    p_elements: snapshot.elements,
    p_fixed: snapshot.fixed,
  });
  if (error) throw error;
  return snapshotRoom(client, roomId);
}

/** Runs a room edit and keeps its undo step only if the edit succeeded. */
export async function recordAroundRoom<T>(
  roomId: string,
  edit: () => Promise<T>,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<T> {
  const before = await snapshotRoom(client, roomId);
  const result = await edit();
  await writeHistory(client, roomId, recordRoom(await readHistory(client, roomId), before));
  return result;
}

export async function undoRoomStep(
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<{ elements: RoomLayoutElement[]; fixed: FixedElement[] }> {
  const [history, current] = await Promise.all([readHistory(client, roomId), snapshotRoom(client, roomId)]);
  const step = undoRoom(history, current);
  if (!step) throw new Error(ROOM_NOTHING_TO_UNDO);
  const result = await restoreRoom(client, roomId, step.restore);
  await writeHistory(client, roomId, step.history);
  return result;
}

export async function redoRoomStep(
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<{ elements: RoomLayoutElement[]; fixed: FixedElement[] }> {
  const [history, current] = await Promise.all([readHistory(client, roomId), snapshotRoom(client, roomId)]);
  const step = redoRoom(history, current);
  if (!step) throw new Error(ROOM_NOTHING_TO_REDO);
  const result = await restoreRoom(client, roomId, step.restore);
  await writeHistory(client, roomId, step.history);
  return result;
}

export async function roomHistoryStepState(
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<{ canUndo: boolean; canRedo: boolean }> {
  return roomHistoryState(await readHistory(client, roomId));
}
