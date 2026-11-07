import type { RoomLayoutElement, FixedElement } from "@/lib/venue/floorplan";

// Multi-step undo/redo for a room's floor-plan editor (walls/doors + table
// templates), stored as one History object on rooms.layout_history. Mirrors
// lib/seating/history.ts's event-layout history exactly (same push/pop/fit
// shape over an opaque snapshot) — kept as its own small module rather than
// a generic reuse, since a room snapshot has no "seats" and isn't scoped
// under an event id.

export interface RoomLayoutSnapshot {
  elements: RoomLayoutElement[];
  fixed: FixedElement[];
}

export interface RoomHistory {
  past: RoomLayoutSnapshot[];
  future: RoomLayoutSnapshot[];
}

export const ROOM_HISTORY_LIMIT = 30;
/** Budget for one room's stored history (JSON characters). */
export const ROOM_HISTORY_MAX_BYTES = 1_500_000;

export function emptyRoomHistory(): RoomHistory {
  return { past: [], future: [] };
}

function clean(h: RoomHistory | null | undefined): RoomHistory {
  return {
    past: Array.isArray(h?.past) ? h.past : [],
    future: Array.isArray(h?.future) ? h.future : [],
  };
}

/** Drops the oldest undo steps (then the farthest redo steps) until the history fits its byte budget; the newest step always stays. */
function fit(h: RoomHistory): RoomHistory {
  const past = [...h.past];
  const future = [...h.future];
  const pastSizes = past.map((s) => JSON.stringify(s).length);
  const futureSizes = future.map((s) => JSON.stringify(s).length);
  let total = 32 + pastSizes.reduce((a, b) => a + b + 1, 0) + futureSizes.reduce((a, b) => a + b + 1, 0);
  while (total > ROOM_HISTORY_MAX_BYTES && past.length > 1) {
    past.shift();
    total -= pastSizes.shift()! + 1;
  }
  while (total > ROOM_HISTORY_MAX_BYTES && future.length > 0) {
    future.pop();
    total -= futureSizes.pop()! + 1;
  }
  return { past, future };
}

/** Before an edit: remember the current state; a new edit ends any redo branch. */
export function recordRoom(h: RoomHistory, current: RoomLayoutSnapshot): RoomHistory {
  const { past } = clean(h);
  return fit({ past: [...past, current].slice(-ROOM_HISTORY_LIMIT), future: [] });
}

export function undoRoom(h: RoomHistory, current: RoomLayoutSnapshot): { history: RoomHistory; restore: RoomLayoutSnapshot } | null {
  const { past, future } = clean(h);
  if (past.length === 0) return null;
  return {
    restore: past[past.length - 1],
    history: fit({ past: past.slice(0, -1), future: [current, ...future].slice(0, ROOM_HISTORY_LIMIT) }),
  };
}

export function redoRoom(h: RoomHistory, current: RoomLayoutSnapshot): { history: RoomHistory; restore: RoomLayoutSnapshot } | null {
  const { past, future } = clean(h);
  if (future.length === 0) return null;
  return {
    restore: future[0],
    history: fit({ past: [...past, current].slice(-ROOM_HISTORY_LIMIT), future: future.slice(1) }),
  };
}

export function roomHistoryState(h: RoomHistory | null | undefined): { canUndo: boolean; canRedo: boolean } {
  const { past, future } = clean(h);
  return { canUndo: past.length > 0, canRedo: future.length > 0 };
}
