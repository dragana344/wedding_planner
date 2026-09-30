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
import { NOTHING_TO_REDO, NOTHING_TO_UNDO, roomHistory } from "@/lib/seating/history-store";
import { historyState, record, redo, undo, type History, type LayoutSnapshot, type SnapshotSeat } from "@/lib/seating/history";

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
// `events`, keyed by room_id, since an event can span more than one room,
// next to the undo/redo history (0072) of each room: { past, future } of
// { elements (the draft room), seats (the room's seat rows) }.
//
// Every write of the two goes through updateState (0077): it writes only if
// events.seating_rev is still what it read, and otherwise runs again on the
// fresh row — two quick edits or two tabs never overwrite each other, and a
// change that fails records no undo step.

type DraftMap = Record<string, EventLayoutElement[]>;
type ConfirmedMap = Record<string, string>;
type HistoryMap = Record<string, History>;

interface SeatingState {
  draft: DraftMap;
  history: HistoryMap;
  confirmedAt: ConfirmedMap;
  rev: number;
}

async function readState(client: SupabaseClient, eventId: string): Promise<SeatingState> {
  const { data, error } = await client
    .from("events")
    .select("seating_draft, seating_history, seating_confirmed_at, seating_rev")
    .eq("id", eventId)
    .single();
  if (error) throw error;
  return {
    draft: (data.seating_draft as DraftMap) ?? {},
    history: (data.seating_history as HistoryMap) ?? {},
    confirmedAt: (data.seating_confirmed_at as ConfirmedMap) ?? {},
    rev: Number(data.seating_rev ?? 0),
  };
}

type Patch = { draft?: DraftMap; history?: HistoryMap } | null;

const MAX_ATTEMPTS = 12;
export const SEATING_BUSY_ERROR = "Распоредот се менува од повеќе места одеднаш. Обидете се повторно.";

async function updateState<T>(
  client: SupabaseClient,
  eventId: string,
  change: (state: SeatingState) => Promise<{ patch: Patch; result: T }>,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const state = await readState(client, eventId);
    const { patch, result } = await change(state);
    if (!patch) return result;
    const values: Record<string, unknown> = { seating_rev: state.rev + 1 };
    if (patch.draft) values.seating_draft = patch.draft;
    if (patch.history) values.seating_history = patch.history;
    const { data, error } = await client
      .from("events")
      .update(values)
      .eq("id", eventId)
      .eq("seating_rev", state.rev)
      .select("id");
    if (error) throw error;
    if (data && data.length > 0) return result;
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 15 * (attempt + 1)));
  }
  throw new Error(SEATING_BUSY_ERROR);
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
  const { draft } = await readState(client, eventId);
  if (roomId in draft) return draft[roomId];

  // Reuses each source row's own stable id (from event_layout_elements)
  // rather than minting a fresh one, so a racing second seed writes the same
  // ids the browser already rendered — and loses to the first (rev check).
  const liveElements = await initializeEventLayoutFromStandard(eventId, roomId, client);
  const seeded = liveElements.map((el) => ({ ...el }));
  return updateState(client, eventId, async (s) =>
    roomId in s.draft
      ? { patch: null, result: s.draft[roomId] }
      : { patch: { draft: { ...s.draft, [roomId]: seeded } }, result: seeded },
  );
}

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

/**
 * One undoable edit of a room's draft: `edit` gets the current elements and
 * returns the new ones (or throws — then nothing is written and no undo step
 * is kept). The step and the new draft are written together.
 */
async function editRoom<T>(
  eventId: string,
  roomId: string,
  client: SupabaseClient,
  edit: (current: EventLayoutElement[]) => { elements: EventLayoutElement[]; result: T },
): Promise<T> {
  const seeded = await getOrInitDraft(eventId, roomId, client);
  return updateState(client, eventId, async (s) => {
    const current = s.draft[roomId] ?? seeded;
    const { elements, result } = edit(current);
    const seats = await roomSeats(client, eventId, roomId);
    const history = { ...s.history, [roomId]: record(roomHistory(s.history, roomId), { elements: current, seats }) };
    return { patch: { draft: { ...s.draft, [roomId]: elements }, history }, result };
  });
}

/** Finds and mutates a single draft element by id (the move/resize/rotate/
 * delete calls don't carry a room id — the element set is small, so a scan is
 * cheap). After a confirm the room has no draft (review I4): the element is
 * then found in the live rows, and the edit re-seeds the draft from them. */
async function mutateDraftElement(
  eventId: string,
  elementId: string,
  client: SupabaseClient,
  mutate: (el: EventLayoutElement) => EventLayoutElement | null
): Promise<EventLayoutElement> {
  const { draft } = await readState(client, eventId);
  let roomId = Object.keys(draft).find((room) => draft[room].some((el) => el.id === elementId));
  if (!roomId) {
    const { data: live, error } = await client
      .from("event_layout_elements")
      .select("room_id")
      .eq("event_id", eventId)
      .eq("id", elementId)
      .maybeSingle();
    if (error) throw error;
    roomId = live?.room_id as string | undefined;
  }
  if (!roomId) throw new Error("Element not found in draft.");
  return editRoom(eventId, roomId, client, (current) => {
    const el = current.find((e) => e.id === elementId);
    if (!el) throw new Error("Element not found in draft.");
    const result = mutate(el);
    return {
      elements: result === null ? current.filter((e) => e.id !== elementId) : current.map((e) => (e.id === elementId ? result : e)),
      result: result ?? el,
    };
  });
}

async function addDraftElement(
  eventId: string,
  input: EventLayoutElementInput,
  client: SupabaseClient
): Promise<EventLayoutElement> {
  const created: EventLayoutElement = {
    id: randomUUID(),
    event_id: eventId,
    room_id: input.room_id,
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
  return editRoom(eventId, input.room_id, client, (current) => ({ elements: [...current, created], result: created }));
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
  // seat detaches. An edit that landed after this confirm keeps its draft.
  const confirmed = JSON.stringify(draftElements);
  await updateState(client, eventId, async (s) => {
    if (!(roomId in s.draft) || JSON.stringify(s.draft[roomId]) !== confirmed) return { patch: null, result: undefined };
    const rest = { ...s.draft };
    delete rest[roomId];
    return { patch: { draft: rest }, result: undefined };
  });
}

/** Clears the confirmed stamp only — the organizer keeps editing their
 * draft, and the next confirm pushes it to staff again. Does not touch
 * event_layout_elements, so staff keeps seeing the last confirmed layout
 * until the organizer confirms again. */
async function unconfirmSeating(eventId: string, roomId: string, client: SupabaseClient): Promise<void> {
  const { confirmedAt } = await readState(client, eventId);
  const next = { ...confirmedAt };
  delete next[roomId];
  const { error } = await client.from("events").update({ seating_confirmed_at: next }).eq("id", eventId);
  if (error) throw error;
}

async function getConfirmedAt(eventId: string, roomId: string, client: SupabaseClient): Promise<string | null> {
  const { confirmedAt } = await readState(client, eventId);
  return confirmedAt[roomId] ?? null;
}

// ---------------------------------------------------------------------------
// Undo / redo

async function stepCouple(eventId: string, roomId: string, client: SupabaseClient, direction: "undo" | "redo"): Promise<EventLayoutElement[]> {
  const seeded = await getOrInitDraft(eventId, roomId, client);
  const seats = await roomSeats(client, eventId, roomId);
  const restore = await updateState(client, eventId, async (s) => {
    const current = { elements: s.draft[roomId] ?? seeded, seats };
    const step = (direction === "undo" ? undo : redo)(roomHistory(s.history, roomId), current);
    if (!step) throw new Error(direction === "undo" ? NOTHING_TO_UNDO : NOTHING_TO_REDO);
    return {
      patch: { draft: { ...s.draft, [roomId]: step.restore.elements }, history: { ...s.history, [roomId]: step.history } },
      result: step.restore,
    };
  });
  // Tables first (written above): restore_room_seats only seats people on tables that exist.
  const { error } = await client.rpc("restore_room_seats", { p_event_id: eventId, p_room_id: roomId, p_seats: restore.seats });
  if (error) throw error;
  return restore.elements;
}

/** The room as it is now, for an undo step taken around a seat-list save. */
export async function captureCoupleSnapshot(eventId: string, roomId: string, client: SupabaseClient = createServiceRoleClient()): Promise<LayoutSnapshot> {
  const [elements, seats] = await Promise.all([getOrInitDraft(eventId, roomId, client), roomSeats(client, eventId, roomId)]);
  return { elements, seats };
}

/** Pushes `before` as an undo step — call only after the change succeeded (review M4). */
export async function pushCoupleHistory(
  eventId: string,
  roomId: string,
  before: LayoutSnapshot,
  client: SupabaseClient = createServiceRoleClient(),
): Promise<void> {
  await updateState(client, eventId, async (s) => ({
    patch: { history: { ...s.history, [roomId]: record(roomHistory(s.history, roomId), before) } },
    result: undefined,
  }));
}

async function setGroup(
  eventId: string,
  roomId: string,
  client: SupabaseClient,
  pick: (el: EventLayoutElement) => boolean,
  groupId: string | null,
): Promise<EventLayoutElement[]> {
  return editRoom(eventId, roomId, client, (current) => {
    const elements = current.map((el) => (pick(el) ? { ...el, group_id: groupId } : el));
    return { elements, result: elements };
  });
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
      const fresh = await copyRoomStandardToDraft(eventId, roomId, client);
      const replaced = await editRoom(eventId, roomId, client, () => ({ elements: fresh, result: fresh }));
      await pruneSeats(eventId, client);
      return replaced;
    },
    // The multi-step history (0072) replaced the single page-load snapshot.
    captureSnapshot: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
    },
    undo: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      return stepCouple(eventId, roomId, client, "undo");
    },
    redo: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      return stepCouple(eventId, roomId, client, "redo");
    },
    getHistoryState: async (_eventId, roomId) => {
      await assertRoomBelongsToEvent(client, eventId, roomId);
      return historyState(roomHistory((await readState(client, eventId)).history, roomId));
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
