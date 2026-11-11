import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";
import { listFixedElements, listRoomLayoutElements, type EventLayoutElement, type FixedElement, type RoomLayoutElement } from "./floorplan";

// Project A, spec §2: a room can have more than one saved, named layout
// ("preset") instead of today's single standing one. Snapshot-based (jsonb)
// — the same approach lib/seating/history.ts already uses for undo — loaded
// wholesale rather than through a normalized per-element table.

export interface RoomPreset {
  id: string;
  room_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export type SnapshotFixed = Omit<FixedElement, "id" | "room_id">;
export type SnapshotElement = Omit<RoomLayoutElement, "id" | "room_id" | "created_at">;
export interface RoomPresetSnapshot {
  fixed: SnapshotFixed[];
  elements: SnapshotElement[];
}

/** Loading a preset would delete and recreate room_layout_elements rows, and
 * reservation_tables.layout_element_id cascades on delete — so a live
 * (future, non-cancelled) reservation booking one of the room's current
 * tables must block the load instead of silently losing its table link. */
export class ReservationsBlockPresetLoadError extends Error {
  constructor() {
    super("Постојат резервации за моментално поставените маси. Откажете ги или преместете ги пред да вчитате друг план.");
    this.name = "ReservationsBlockPresetLoadError";
  }
}

const PRESET_COLUMNS = "id, room_id, name, created_at, updated_at";

export async function listRoomPresets(roomId: string, client: SupabaseClient = resolveSupabaseClient()): Promise<RoomPreset[]> {
  const { data, error } = await client
    .from("room_layout_presets")
    .select(PRESET_COLUMNS)
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

/** Snapshots the room's current fixed + movable elements under `name`; saving an existing name's preset again overwrites it. */
export async function saveRoomPreset(roomId: string, name: string, client: SupabaseClient = resolveSupabaseClient()): Promise<RoomPreset> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Внесете име за планот.");
  const [fixed, elements] = await Promise.all([listFixedElements(roomId, client), listRoomLayoutElements(roomId, client)]);
  const snapshot: RoomPresetSnapshot = {
    fixed: fixed.map((f) => ({
      element_type: f.element_type, x_cm: f.x_cm, y_cm: f.y_cm, width_cm: f.width_cm, height_cm: f.height_cm,
      rotation_deg: f.rotation_deg, label: f.label,
    })),
    elements: elements.map((el) => ({
      element_type: el.element_type, table_type_id: el.table_type_id, x_cm: el.x_cm, y_cm: el.y_cm,
      width_cm: el.width_cm, length_cm: el.length_cm, rotation_deg: el.rotation_deg, label: el.label,
      group_id: el.group_id, table_role: el.table_role, shape: el.shape,
    })),
  };
  const { data, error } = await client
    .from("room_layout_presets")
    .upsert({ room_id: roomId, name: trimmed, snapshot, updated_at: new Date().toISOString() }, { onConflict: "room_id,name" })
    .select(PRESET_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** Snapshots an explicit, not-yet-persisted set of movable elements (e.g. a
 * layout just built in the event-creation wizard) as a named preset, under
 * the room's current fixed elements — unlike saveRoomPreset, never reads
 * room_layout_elements, so it cannot pick up edits the caller hasn't made. */
export async function saveRoomPresetFromElements(
  roomId: string,
  name: string,
  elements: SnapshotElement[],
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<RoomPreset> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Внесете име за планот.");
  const fixed = await listFixedElements(roomId, client);
  const snapshot: RoomPresetSnapshot = {
    fixed: fixed.map((f) => ({
      element_type: f.element_type, x_cm: f.x_cm, y_cm: f.y_cm, width_cm: f.width_cm, height_cm: f.height_cm,
      rotation_deg: f.rotation_deg, label: f.label,
    })),
    elements,
  };
  const { data, error } = await client
    .from("room_layout_presets")
    .upsert({ room_id: roomId, name: trimmed, snapshot, updated_at: new Date().toISOString() }, { onConflict: "room_id,name" })
    .select(PRESET_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** Reads a preset's snapshot without touching the room's live elements —
 * for seeding somewhere other than the room template itself (e.g. the
 * event-creation wizard), where loadRoomPreset's destructive replace of
 * room_fixed_elements/room_layout_elements would corrupt the shared room. */
export async function getRoomPresetSnapshot(
  presetId: string,
  roomId: string,
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<RoomPresetSnapshot> {
  const { data, error } = await client.from("room_layout_presets").select("room_id, snapshot").eq("id", presetId).single();
  if (error) throw error;
  if (data.room_id !== roomId) throw new Error("Планот не припаѓа на оваа сала.");
  return data.snapshot as RoomPresetSnapshot;
}

/** Replaces the room's current fixed + movable elements with a fresh copy of the preset's snapshot (new row ids). */
export async function loadRoomPreset(presetId: string, roomId: string, client: SupabaseClient = resolveSupabaseClient()): Promise<void> {
  const { data: preset, error } = await client.from("room_layout_presets").select("room_id, snapshot").eq("id", presetId).single();
  if (error) throw error;
  if (preset.room_id !== roomId) throw new Error("Планот не припаѓа на оваа сала.");
  const snapshot = preset.snapshot as RoomPresetSnapshot;

  const currentElements = await listRoomLayoutElements(roomId, client);
  if (currentElements.length > 0) {
    const { data: blocking, error: blockingError } = await client
      .from("reservation_tables")
      .select("layout_element_id, reservations!inner(date, status)")
      .in(
        "layout_element_id",
        currentElements.map((e) => e.id),
      )
      .gte("reservations.date", new Date().toISOString().slice(0, 10))
      .neq("reservations.status", "cancelled");
    if (blockingError) throw blockingError;
    if (blocking && blocking.length > 0) throw new ReservationsBlockPresetLoadError();
  }

  const { error: delFixedError } = await client.from("room_fixed_elements").delete().eq("room_id", roomId);
  if (delFixedError) throw delFixedError;
  const { error: delLayoutError } = await client.from("room_layout_elements").delete().eq("room_id", roomId);
  if (delLayoutError) throw delLayoutError;

  if (snapshot.fixed.length > 0) {
    const { error: fixedInsertError } = await client.from("room_fixed_elements").insert(snapshot.fixed.map((f) => ({ ...f, room_id: roomId })));
    if (fixedInsertError) throw fixedInsertError;
  }
  if (snapshot.elements.length > 0) {
    // Explicit, increasing created_at: one bulk insert would give every row
    // the same timestamp and scramble "Маса N" (numbered by created_at) —
    // same reasoning as copyRoomLayoutToEvent in ./floorplan.
    const { error: elInsertError } = await client.from("room_layout_elements").insert(
      snapshot.elements.map((el, i) => ({ ...el, room_id: roomId, created_at: new Date(Date.now() + i).toISOString() })),
    );
    if (elInsertError) throw elInsertError;
  }
}

export async function deleteRoomPreset(presetId: string, roomId: string, client: SupabaseClient = resolveSupabaseClient()): Promise<void> {
  const { error } = await client.from("room_layout_presets").delete().eq("id", presetId).eq("room_id", roomId);
  if (error) throw error;
}

const EVENT_LAYOUT_COLUMNS =
  "id, event_id, room_id, element_type, table_type_id, x_cm, y_cm, width_cm, length_cm, rotation_deg, label, group_id, table_role";

/**
 * Replaces one event's room seating with a fresh copy of a saved preset's
 * snapshot (new row ids) — the per-event analogue of loadRoomPreset, which
 * instead replaces the room's own standing layout. Only the movable
 * `elements` apply: an event has no fixed-elements layer of its own (walls,
 * doors etc. come from the room, not the event). Unlike loadRoomPreset, this
 * never touches `room_layout_elements`/`room_fixed_elements`, so the
 * reservations-block check there doesn't apply here — reservations key off
 * the room's own tables, not an event's draft layout.
 */
export async function loadEventLayoutFromPreset(
  eventId: string,
  roomId: string,
  presetId: string,
  client: SupabaseClient = resolveSupabaseClient(),
): Promise<EventLayoutElement[]> {
  const snapshot = await getRoomPresetSnapshot(presetId, roomId, client);

  const { error: deleteError } = await client.from("event_layout_elements").delete().eq("event_id", eventId).eq("room_id", roomId);
  if (deleteError) throw deleteError;

  if (snapshot.elements.length === 0) return [];
  const { data, error } = await client
    .from("event_layout_elements")
    .insert(
      // Explicit, increasing created_at: one bulk insert would give every row
      // the same timestamp and scramble "Маса N" (numbered by created_at) —
      // same reasoning as copyRoomLayoutToEvent in ./floorplan.
      snapshot.elements.map((el, i) => ({
        created_at: new Date(Date.now() + i).toISOString(),
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
        shape: el.shape ?? null,
      })),
    )
    .select(EVENT_LAYOUT_COLUMNS);
  if (error) throw error;
  return data;
}
