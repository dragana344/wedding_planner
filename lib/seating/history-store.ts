import type { EventLayoutElement } from "@/lib/venue/floorplan";
import { historyState, record, redo, undo, type History, type LayoutSnapshot } from "./history";

// The undo/redo steps, independent of where a room's layout and history
// live: the couple's draft (service role) or the staff's live layout (RLS
// client). Each side supplies a store for one room.

export interface HistoryStore {
  read(): Promise<History>;
  write(history: History): Promise<void>;
  snapshot(): Promise<LayoutSnapshot>;
  /** Puts a snapshot back; returns the room's elements afterwards. */
  restore(snapshot: LayoutSnapshot): Promise<EventLayoutElement[]>;
}

export const NOTHING_TO_UNDO = "Нема што да се врати.";
export const NOTHING_TO_REDO = "Нема што да се повтори.";

/** Call before an edit, so the edit can be undone. */
export async function recordStep(store: HistoryStore): Promise<void> {
  const [history, current] = await Promise.all([store.read(), store.snapshot()]);
  await store.write(record(history, current));
}

async function move(store: HistoryStore, step: typeof undo, emptyMessage: string): Promise<EventLayoutElement[]> {
  const [history, current] = await Promise.all([store.read(), store.snapshot()]);
  const result = step(history, current);
  if (!result) throw new Error(emptyMessage);
  const elements = await store.restore(result.restore);
  await store.write(result.history);
  return elements;
}

export function undoStep(store: HistoryStore): Promise<EventLayoutElement[]> {
  return move(store, undo, NOTHING_TO_UNDO);
}

export function redoStep(store: HistoryStore): Promise<EventLayoutElement[]> {
  return move(store, redo, NOTHING_TO_REDO);
}

export async function stepState(store: HistoryStore): Promise<{ canUndo: boolean; canRedo: boolean }> {
  return historyState(await store.read());
}

/** Reads one room's history out of the { room_id: History } jsonb map. */
export function roomHistory(map: unknown, roomId: string): History {
  const h = (map as Record<string, History> | null)?.[roomId];
  return { past: Array.isArray(h?.past) ? h.past : [], future: Array.isArray(h?.future) ? h.future : [] };
}
