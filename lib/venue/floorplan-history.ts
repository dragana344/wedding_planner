import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";
import type { SeatingActions } from "@/components/venue/dashboard/EventSeatingPage";
import { getRoomSeatingForStaff } from "@/lib/seating/read";
import type { History, SnapshotSeat } from "@/lib/seating/history";
import { recordStep, redoStep, roomHistory, stepState, undoStep, type HistoryStore } from "@/lib/seating/history-store";
import {
  addEventLayoutElement,
  deleteEventLayoutElement,
  initializeEventLayoutFromStandard,
  listEventLayoutElements,
  listFixedElements,
  revertEventLayoutToStandard,
  updateEventLayoutElementPosition,
  updateEventLayoutElementRotation,
  updateEventLayoutElementSize,
  updateEventLayoutElementLabel,
  type EventLayoutElement,
} from "@/lib/venue/floorplan";

// Staff's seating editor on the live event layout, with the multi-step
// undo/redo of 0072 (events.layout_history). Runs in the browser as the
// signed-in staff user: RLS limits every read and write to their venue.

function staffHistoryStore(eventId: string, roomId: string): HistoryStore {
  const client = resolveSupabaseClient();
  return {
    async read() {
      const { data, error } = await client.from("events").select("layout_history").eq("id", eventId).single();
      if (error) throw error;
      return roomHistory(data.layout_history, roomId);
    },
    async write(history: History) {
      const { data, error } = await client.from("events").select("layout_history").eq("id", eventId).single();
      if (error) throw error;
      const map = { ...((data.layout_history as Record<string, History>) ?? {}), [roomId]: history };
      const { error: writeError } = await client.from("events").update({ layout_history: map }).eq("id", eventId);
      if (writeError) throw writeError;
    },
    async snapshot() {
      const [elements, seats] = await Promise.all([
        listEventLayoutElements(eventId, roomId, client),
        client
          .from("event_seat_assignments")
          .select("layout_element_id, seat_number, guest_id, guest_name")
          .eq("event_id", eventId)
          .eq("room_id", roomId)
          .order("layout_element_id")
          .order("seat_number"),
      ]);
      if (seats.error) throw seats.error;
      return { elements, seats: seats.data as SnapshotSeat[] };
    },
    async restore(snapshot) {
      // One transaction (0076): the layout comes back whole or not at all, and
      // seats are only added back — never deleted — so the couple's seating
      // made after this snapshot survives staff's undo.
      const { error } = await client.rpc("restore_staff_layout", {
        p_event_id: eventId,
        p_room_id: roomId,
        p_elements: snapshot.elements,
        p_seats: snapshot.seats,
      });
      if (error) throw error;
      return listEventLayoutElements(eventId, roomId, client);
    },
  };
}

async function roomOf(elementId: string): Promise<{ eventId: string; roomId: string }> {
  const { data, error } = await resolveSupabaseClient()
    .from("event_layout_elements")
    .select("event_id, room_id")
    .eq("id", elementId)
    .single();
  if (error) throw error;
  return { eventId: data.event_id, roomId: data.room_id };
}

async function recordFor(elementId: string): Promise<{ eventId: string; roomId: string }> {
  const where = await roomOf(elementId);
  await recordStep(staffHistoryStore(where.eventId, where.roomId));
  return where;
}

async function pruneSeats(eventId: string): Promise<void> {
  const { error } = await resolveSupabaseClient().rpc("prune_event_seat_assignments", { p_event_id: eventId });
  if (error) throw error;
}

async function setGroup(eventId: string, roomId: string, ids: string[], groupId: string | null): Promise<EventLayoutElement[]> {
  await recordStep(staffHistoryStore(eventId, roomId));
  const { error } = await resolveSupabaseClient()
    .from("event_layout_elements")
    .update({ group_id: groupId })
    .eq("event_id", eventId)
    .eq("room_id", roomId)
    .in("id", ids);
  if (error) throw error;
  return listEventLayoutElements(eventId, roomId);
}

export const venueHistoryActions: SeatingActions = {
  listFixedElements,
  listLayoutElements: listEventLayoutElements,
  initializeFromStandard: initializeEventLayoutFromStandard,
  addElement: async (input) => {
    await recordStep(staffHistoryStore(input.event_id, input.room_id));
    return addEventLayoutElement(input);
  },
  moveElement: async (id, xCm, yCm) => {
    await recordFor(id);
    return updateEventLayoutElementPosition(id, xCm, yCm);
  },
  resizeElement: async (id, widthCm, lengthCm) => {
    await recordFor(id);
    return updateEventLayoutElementSize(id, widthCm, lengthCm);
  },
  rotateElement: async (id, rotationDeg) => {
    await recordFor(id);
    return updateEventLayoutElementRotation(id, rotationDeg);
  },
  relabelElement: async (id, label) => {
    await recordFor(id);
    return updateEventLayoutElementLabel(id, label?.trim() || null);
  },
  deleteElement: async (id) => {
    const { eventId } = await recordFor(id);
    await deleteEventLayoutElement(id);
    await pruneSeats(eventId);
  },
  revertToStandard: async (eventId, roomId) => {
    await recordStep(staffHistoryStore(eventId, roomId));
    const elements = await revertEventLayoutToStandard(eventId, roomId);
    await pruneSeats(eventId);
    return elements;
  },
  // The multi-step history replaced the single page-load snapshot.
  captureSnapshot: async () => {},
  undo: (eventId, roomId) => undoStep(staffHistoryStore(eventId, roomId)),
  redo: (eventId, roomId) => redoStep(staffHistoryStore(eventId, roomId)),
  getHistoryState: (eventId, roomId) => stepState(staffHistoryStore(eventId, roomId)),
  group: async (eventId, roomId, elementIds) => {
    const tables = (await listEventLayoutElements(eventId, roomId)).filter(
      (el) => elementIds.includes(el.id) && el.element_type === "table",
    );
    if (tables.length < 2) throw new Error("Изберете најмалку две маси за групирање.");
    return setGroup(eventId, roomId, tables.map((t) => t.id), crypto.randomUUID());
  },
  ungroup: async (eventId, roomId, groupId) => {
    const ids = (await listEventLayoutElements(eventId, roomId)).filter((el) => el.group_id === groupId).map((el) => el.id);
    return setGroup(eventId, roomId, ids, null);
  },
  // Staff read seat lists (RLS-checked function); they never edit them.
  getRoomSeating: (eventId, roomId) => getRoomSeatingForStaff(resolveSupabaseClient(), eventId, roomId),
};
