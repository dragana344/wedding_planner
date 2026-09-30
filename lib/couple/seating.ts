import "server-only";
import { randomUUID } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  listFixedElements,
  listRoomLayoutElements,
  initializeEventLayoutFromStandard,
  type EventLayoutElement,
  type EventLayoutElementInput,
} from "@/lib/venue/floorplan";
import type { SeatingActions } from "@/components/venue/dashboard/EventSeatingPage";
import { recordStep, redoStep, roomHistory, stepState, undoStep, type HistoryStore } from "@/lib/seating/history-store";
import type { History, SnapshotSeat } from "@/lib/seating/history";

async function assertRoomBelongsToEvent(
  client: SupabaseClient,
  eventId: string,
  roomId: string
): Promise<void> {
  const { data, error } = await client
    .from("event_rooms")
    .select("room_id")
    .eq("event_id", eventId)
    .eq("room_id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Room is not assigned to this event.");
}

async function assertTableTypeBelongsToRoom(
  client: SupabaseClient,
  roomId: string,
  tableTypeId: string
): Promise<void> {
  const { data, error } = await client
    .from("table_types")
    .select("room_id")
    .eq("id", tableTypeId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.room_id !== roomId) throw new Error("Table type does not belong to this room.");
}

// ---------------------------------------------------------------------------
// Draft storage: an organizer's own private, in-progress seating arrangement
// for one event, kept separate from event_layout_elements (the row set staff
// read/edit) until the organizer explicitly confirms it. Stored as jsonb on
// `events`, keyed by room_id, since an event can span more than one room.

type DraftMap = Record<string, EventLayoutElement[]>;
type ConfirmedMap = Record<string, string>;

async function readEventJsonColumns(
  client: SupabaseClient,
  eventId: string
): Promise<{ draft: DraftMap; draftUndo: DraftMap; confirmedAt: ConfirmedMap }> {
  const { data, error } = await client
    .from("events")
    .select("seating_draft, seating_draft_undo, seating_confirmed_at")
    .eq("id", eventId)
    .single();
  if (error) throw error;
  return {
    draft: (data.seating_draft as DraftMap) ?? {},
    draftUndo: (data.seating_draft_undo as DraftMap) ?? {},
    confirmedAt: (data.seating_confirmed_at as ConfirmedMap) ?? {},
  };
}

async function writeDraft(client: SupabaseClient, eventId: string, draft: DraftMap): Promise<void> {
  const { error } = await client.from("events").update({ seating_draft: draft }).eq("id", eventId);
  if (error) throw error;
}

async function copyRoomStandardToDraft(
  eventId: string,
  roomId: string,
  client: SupabaseClient
): Promise<EventLayoutElement[]> {
  const roomElements = await listRoomLayoutElements(roomId, client);
  return roomElements.map((el) => ({
    id: randomUUID(),
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
    group_id: el.group_id ?? null,
    table_role: el.table_role ?? "guest",
  }));
}

/** Returns the organizer's draft for one room, initializing it on first use
 * from the event's current (staff-visible) layout — bootstrapping that from
 * the room's standard layout first, if this is the very first time anyone
 * has opened seating for this event/room. */
async function getOrInitDraft(
  eventId: string,
  roomId: string,
  client: SupabaseClient
): Promise<EventLayoutElement[]> {
  const { draft } = await readEventJsonColumns(client, eventId);
  if (roomId in draft) return draft[roomId];

  // Reuses each source row's own stable id (from event_layout_elements)
  // rather than minting a fresh one: if this whole function races — e.g. a
  // Next.js dev-mode double-invocation of the seating page's server
  // component — both calls compute the same seed content and ids, so the
  // second write is idempotent instead of orphaning ids the browser already
  // rendered from the first.
  const liveElements = await initializeEventLayoutFromStandard(eventId, roomId, client);
  const seeded = liveElements.map((el) => ({ ...el }));
  await writeDraft(client, eventId, { ...draft, [roomId]: seeded });
  return seeded;
}

async function replaceDraftRoom(
  eventId: string,
  roomId: string,
  elements: EventLayoutElement[],
  client: SupabaseClient
): Promise<EventLayoutElement[]> {
  const { draft } = await readEventJsonColumns(client, eventId);
  const next = { ...draft, [roomId]: elements };
  await writeDraft(client, eventId, next);
  return elements;
}

/** Finds and mutates a single draft element by id, searching every room's
 * array (the SeatingActions move/resize/rotate/delete calls don't carry a
 * room id — the underlying element set is small, so a scan is cheap). */
async function mutateDraftElement(
  eventId: string,
  elementId: string,
  client: SupabaseClient,
  mutate: (el: EventLayoutElement) => EventLayoutElement | null,
  reseeded = false
): Promise<EventLayoutElement> {
  const { draft } = await readEventJsonColumns(client, eventId);
  for (const roomId of Object.keys(draft)) {
    const idx = draft[roomId].findIndex((el) => el.id === elementId);
    if (idx === -1) continue;
    await recordStep(coupleHistoryStore(eventId, roomId, client));
    const result = mutate(draft[roomId][idx]);
    const nextRoomElements =
      result === null
        ? draft[roomId].filter((el) => el.id !== elementId)
        : draft[roomId].map((el) => (el.id === elementId ? result : el));
    await writeDraft(client, eventId, { ...draft, [roomId]: nextRoomElements });
    return result ?? draft[roomId][idx];
  }
  // Confirming hands a room back to the live layout and drops its draft
  // (review I4); the next edit re-seeds the draft from those rows, whose ids
  // the page is still showing.
  if (!reseeded) {
    const { data: live, error } = await client
      .from("event_layout_elements")
      .select("room_id")
      .eq("event_id", eventId)
      .eq("id", elementId)
      .maybeSingle();
    if (error) throw error;
    if (live) {
      await getOrInitDraft(eventId, live.room_id, client);
      return mutateDraftElement(eventId, elementId, client, mutate, true);
    }
  }
  throw new Error("Element not found in draft.");
}

async function addDraftElement(
  eventId: string,
  input: EventLayoutElementInput,
  client: SupabaseClient
): Promise<EventLayoutElement> {
  const { draft } = await readEventJsonColumns(client, eventId);
  const roomId = input.room_id;
  const created: EventLayoutElement = {
    id: randomUUID(),
    event_id: eventId,
    room_id: roomId,
    element_type: input.element_type,
    table_type_id: input.table_type_id ?? null,
    x_cm: input.x_cm,
    y_cm: input.y_cm,
    width_cm: input.width_cm,
    length_cm: input.length_cm,
    rotation_deg: 0,
    label: input.label ?? null,
    group_id: null,
    table_role: input.table_role ?? "guest",
  };
  const existing = roomId in draft ? draft[roomId] : await getOrInitDraft(eventId, roomId, client);
  await recordStep(coupleHistoryStore(eventId, roomId, client));
  const { draft: latest } = await readEventJsonColumns(client, eventId);
  await writeDraft(client, eventId, { ...latest, [roomId]: [...existing, created] });
  return created;
}

/** Copies the organizer's current draft over event_layout_elements — the
 * rows staff read/edit — and stamps the room as confirmed. Staff's own
 * ability to edit event_layout_elements afterwards is unaffected. */
async function confirmSeating(eventId: string, roomId: string, client: SupabaseClient): Promise<void> {
  const draftElements = await getOrInitDraft(eventId, roomId, client);

  // REL-005: replace + stamp in one transaction (migration 0041).
  const { error } = await client.rpc("confirm_event_seating", {
    p_event_id: eventId,
    p_room_id: roomId,
    // Ids carried over (0070) so seats on these tables stay attached.
    p_elements: draftElements.map((el) => ({
      id: el.id,
      element_type: el.element_type,
      table_type_id: el.table_type_id,
      x_cm: el.x_cm,
      y_cm: el.y_cm,
      width_cm: el.width_cm,
      length_cm: el.length_cm,
      rotation_deg: el.rotation_deg,
      label: el.label,
      group_id: el.group_id ?? null,
      table_role: el.table_role ?? "guest",
    })),
    p_confirmed_at: new Date().toISOString(),
  });
  if (error) throw error;

  // Hand the room back to the confirmed layout (review I4): with the draft
  // gone, staff's later changes count for seating, numbering and print. The
  // next edit re-seeds the draft from the live rows with the same ids, so no
  // seat detaches.
  const { draft } = await readEventJsonColumns(client, eventId);
  const rest = { ...draft };
  delete rest[roomId];
  await writeDraft(client, eventId, rest);
}

/** Clears the confirmed stamp only — the organizer keeps editing their
 * draft, and the next confirm pushes it to staff again. Does not touch
 * event_layout_elements, so staff keeps seeing the last confirmed layout
 * until the organizer confirms again. */
async function unconfirmSeating(eventId: string, roomId: string, client: SupabaseClient): Promise<void> {
  const { confirmedAt } = await readEventJsonColumns(client, eventId);
  const next = { ...confirmedAt };
  delete next[roomId];
  const { error } = await client.from("events").update({ seating_confirmed_at: next }).eq("id", eventId);
  if (error) throw error;
}

async function getConfirmedAt(eventId: string, roomId: string, client: SupabaseClient): Promise<string | null> {
  const { confirmedAt } = await readEventJsonColumns(client, eventId);
  return confirmedAt[roomId] ?? null;
}

// ---------------------------------------------------------------------------
// Undo/redo (0072): events.seating_history[room] holds { past, future } of
// { elements (the draft room), seats (the room's seat rows) }.

async function roomSeats(client: SupabaseClient, eventId: string, roomId: string): Promise<SnapshotSeat[]> {
  const { data, error } = await client
    .from("event_seat_assignments")
    .select("layout_element_id, seat_number, guest_id, guest_name")
    .eq("event_id", eventId)
    .eq("room_id", roomId)
    .order("layout_element_id")
    .order("seat_number");
  if (error) throw error;
  return data as SnapshotSeat[];
}

function coupleHistoryStore(eventId: string, roomId: string, client: SupabaseClient): HistoryStore {
  return {
    async read() {
      const { data, error } = await client.from("events").select("seating_history").eq("id", eventId).single();
      if (error) throw error;
      return roomHistory(data.seating_history, roomId);
    },
    async write(history: History) {
      const { data, error } = await client.from("events").select("seating_history").eq("id", eventId).single();
      if (error) throw error;
      const map = { ...((data.seating_history as Record<string, History>) ?? {}), [roomId]: history };
      const { error: writeError } = await client.from("events").update({ seating_history: map }).eq("id", eventId);
      if (writeError) throw writeError;
    },
    async snapshot() {
      const [elements, seats] = await Promise.all([getOrInitDraft(eventId, roomId, client), roomSeats(client, eventId, roomId)]);
      return { elements, seats };
    },
    async restore(snapshot) {
      // Tables first: restore_room_seats only seats people on tables that exist.
      const elements = await replaceDraftRoom(eventId, roomId, snapshot.elements, client);
      const { error } = await client.rpc("restore_room_seats", { p_event_id: eventId, p_room_id: roomId, p_seats: snapshot.seats });
      if (error) throw error;
      return elements;
    },
  };
}

/** Records the room's current state as an undo step (e.g. before a seat-list save). */
export async function recordCoupleHistory(eventId: string, roomId: string, client: SupabaseClient = createServiceRoleClient()): Promise<void> {
  await recordStep(coupleHistoryStore(eventId, roomId, client));
}

async function setGroup(
  eventId: string,
  roomId: string,
  client: SupabaseClient,
  pick: (el: EventLayoutElement) => boolean,
  groupId: string | null,
): Promise<EventLayoutElement[]> {
  const current = await getOrInitDraft(eventId, roomId, client);
  await recordStep(coupleHistoryStore(eventId, roomId, client));
  const next = current.map((el) => (pick(el) ? { ...el, group_id: groupId } : el));
  return replaceDraftRoom(eventId, roomId, next, client);
}

/** Drops seats whose table left the layout or shrank below the seat number (0070). */
async function pruneSeats(eventId: string, client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc("prune_event_seat_assignments", { p_event_id: eventId });
  if (error) throw error;
}

export function coupleSeatingActionsFor(eventId: string): SeatingActions {
  const client = createServiceRoleClient();
  return {
    listFixedElements: async (roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      return listFixedElements(roomId, client);
    },
    listLayoutElements: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      return getOrInitDraft(eventId, roomId, client);
    },
    initializeFromStandard: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      return getOrInitDraft(eventId, roomId, client);
    },
    addElement: async (input: EventLayoutElementInput) => {
      await assertRoomBelongsToEvent(client, eventId, input.room_id);
      if (input.table_type_id) {
        await assertTableTypeBelongsToRoom(client, input.room_id, input.table_type_id);
      }
      return addDraftElement(eventId, input, client);
    },
    moveElement: async (id, xCm, yCm) =>
      mutateDraftElement(eventId, id, client, (el) => ({ ...el, x_cm: xCm, y_cm: yCm })),
    resizeElement: async (id, widthCm, lengthCm) =>
      mutateDraftElement(eventId, id, client, (el) => ({ ...el, width_cm: widthCm, length_cm: lengthCm })),
    rotateElement: async (id, rotationDeg) =>
      mutateDraftElement(eventId, id, client, (el) => ({ ...el, rotation_deg: rotationDeg })),
    relabelElement: async (id, label) =>
      mutateDraftElement(eventId, id, client, (el) => ({ ...el, label: label?.trim() || null })),
    deleteElement: async (id) => {
      await mutateDraftElement(eventId, id, client, () => null);
      await pruneSeats(eventId, client);
    },
    revertToStandard: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      await recordStep(coupleHistoryStore(eventId, roomId, client));
      const fresh = await copyRoomStandardToDraft(eventId, roomId, client);
      const replaced = await replaceDraftRoom(eventId, roomId, fresh, client);
      await pruneSeats(eventId, client);
      return replaced;
    },
    // The multi-step history (0072) replaced the single page-load snapshot.
    captureSnapshot: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
    },
    undo: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      return undoStep(coupleHistoryStore(eventId, roomId, client));
    },
    redo: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      return redoStep(coupleHistoryStore(eventId, roomId, client));
    },
    getHistoryState: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      return stepState(coupleHistoryStore(eventId, roomId, client));
    },
    group: async (_eventId, roomId, elementIds) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      const ids = new Set(elementIds);
      const tables = (await getOrInitDraft(eventId, roomId, client)).filter((el) => ids.has(el.id) && el.element_type === "table");
      if (tables.length < 2) throw new Error("Изберете најмалку две маси за групирање.");
      return setGroup(eventId, roomId, client, (el) => ids.has(el.id) && el.element_type === "table", randomUUID());
    },
    ungroup: async (_eventId, roomId, groupId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      return setGroup(eventId, roomId, client, (el) => el.group_id === groupId, null);
    },
    getConfirmedAt: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      return getConfirmedAt(eventId, roomId, client);
    },
    confirm: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      await confirmSeating(eventId, roomId, client);
      await pruneSeats(eventId, client);
    },
    unconfirm: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      await unconfirmSeating(eventId, roomId, client);
    },
  };
}
