import type { SupabaseClient } from "@supabase/supabase-js";
import type { SeatingActions } from "@/components/venue/dashboard/EventSeatingPage";
import { getRoomSeatingForStaff } from "@/lib/seating/read";
import type { History, SnapshotSeat } from "@/lib/seating/history";
import { recordAround, redoStep, roomHistory, stepState, undoStep, type HistoryStore } from "@/lib/seating/history-store";
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
// undo/redo of 0072 (events.layout_history). Since 0104 staff can only read
// the layout through RLS: every write runs server-side in
// /api/venue/events/[eventId]/seating behind the manager-elevation check,
// with a service-role client — so the route, not RLS, scopes each call to
// the caller's venue before reaching these actions.

function staffHistoryStore(client: SupabaseClient, eventId: string, roomId: string): HistoryStore {
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

export function staffLayoutActions(client: SupabaseClient): SeatingActions {
  async function roomOf(elementId: string): Promise<{ eventId: string; roomId: string }> {
    const { data, error } = await client.from("event_layout_elements").select("event_id, room_id").eq("id", elementId).single();
    if (error) throw error;
    return { eventId: data.event_id, roomId: data.room_id };
  }

  /** Runs a staff edit of one element with its undo step kept only on success. */
  async function editElement<T>(elementId: string, edit: (where: { eventId: string; roomId: string }) => Promise<T>): Promise<T> {
    const where = await roomOf(elementId);
    return recordAround(staffHistoryStore(client, where.eventId, where.roomId), () => edit(where));
  }

  async function pruneSeats(eventId: string): Promise<void> {
    const { error } = await client.rpc("prune_event_seat_assignments", { p_event_id: eventId });
    if (error) throw error;
  }

  async function setGroup(eventId: string, roomId: string, ids: string[], groupId: string | null): Promise<EventLayoutElement[]> {
    return recordAround(staffHistoryStore(client, eventId, roomId), async () => {
      const { error } = await client
        .from("event_layout_elements")
        .update({ group_id: groupId })
        .eq("event_id", eventId)
        .eq("room_id", roomId)
        .in("id", ids);
      if (error) throw error;
      return listEventLayoutElements(eventId, roomId, client);
    });
  }

  return {
    listFixedElements: (roomId) => listFixedElements(roomId, client),
    listLayoutElements: (eventId, roomId) => listEventLayoutElements(eventId, roomId, client),
    initializeFromStandard: (eventId, roomId) => initializeEventLayoutFromStandard(eventId, roomId, client),
    addElement: (input) =>
      recordAround(staffHistoryStore(client, input.event_id, input.room_id), () => addEventLayoutElement(input, client)),
    moveElement: (id, xCm, yCm) => editElement(id, () => updateEventLayoutElementPosition(id, xCm, yCm, client)),
    resizeElement: (id, widthCm, lengthCm) => editElement(id, () => updateEventLayoutElementSize(id, widthCm, lengthCm, client)),
    rotateElement: (id, rotationDeg) => editElement(id, () => updateEventLayoutElementRotation(id, rotationDeg, client)),
    relabelElement: (id, label) => editElement(id, () => updateEventLayoutElementLabel(id, label?.trim() || null, client)),
    deleteElement: (id) =>
      editElement(id, async ({ eventId }) => {
        await deleteEventLayoutElement(id, client);
        await pruneSeats(eventId);
      }),
    revertToStandard: (eventId, roomId) =>
      recordAround(staffHistoryStore(client, eventId, roomId), async () => {
        const elements = await revertEventLayoutToStandard(eventId, roomId, client);
        await pruneSeats(eventId);
        return elements;
      }),
    // The multi-step history replaced the single page-load snapshot.
    captureSnapshot: async () => {},
    undo: (eventId, roomId) => undoStep(staffHistoryStore(client, eventId, roomId)),
    redo: (eventId, roomId) => redoStep(staffHistoryStore(client, eventId, roomId)),
    getHistoryState: (eventId, roomId) => stepState(staffHistoryStore(client, eventId, roomId)),
    group: async (eventId, roomId, elementIds) => {
      const tables = (await listEventLayoutElements(eventId, roomId, client)).filter(
        (el) => elementIds.includes(el.id) && el.element_type === "table",
      );
      if (tables.length < 2) throw new Error("Изберете најмалку две маси за групирање.");
      return setGroup(eventId, roomId, tables.map((t) => t.id), crypto.randomUUID());
    },
    ungroup: async (eventId, roomId, groupId) => {
      const ids = (await listEventLayoutElements(eventId, roomId, client)).filter((el) => el.group_id === groupId).map((el) => el.id);
      return setGroup(eventId, roomId, ids, null);
    },
    // Staff read seat lists (RLS-checked function); they never edit them.
    getRoomSeating: (eventId, roomId) => getRoomSeatingForStaff(client, eventId, roomId),
  };
}
