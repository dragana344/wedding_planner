import type { EventLayoutElement } from "@/lib/venue/floorplan";

// Multi-step undo/redo for one room's seating plan (B3). A snapshot is the
// room's layout plus its seats, so undoing "врати стандардно" or a table
// delete also brings the seated guests back. Stored per room as jsonb on
// events (seating_history for the couple, layout_history for staff).

export interface SnapshotSeat {
  layout_element_id: string;
  seat_number: number;
  guest_id: string | null;
  guest_name: string | null;
}

export interface LayoutSnapshot {
  elements: EventLayoutElement[];
  seats: SnapshotSeat[];
}

export interface History {
  past: LayoutSnapshot[];
  future: LayoutSnapshot[];
}

export const HISTORY_LIMIT = 30;
/** Budget for one room's stored history (JSON characters): a 40-table hall with every seat filled is ~60 KB a step. */
export const HISTORY_MAX_BYTES = 1_500_000;

export function emptyHistory(): History {
  return { past: [], future: [] };
}

function clean(h: History | null | undefined): History {
  return {
    past: Array.isArray(h?.past) ? h.past : [],
    future: Array.isArray(h?.future) ? h.future : [],
  };
}

/** Drops the oldest undo steps (then the farthest redo steps) until the history fits its byte budget; the newest step always stays. */
function fit(h: History): History {
  const past = [...h.past];
  const future = [...h.future];
  const pastSizes = past.map((s) => JSON.stringify(s).length);
  const futureSizes = future.map((s) => JSON.stringify(s).length);
  let total = 32 + pastSizes.reduce((a, b) => a + b + 1, 0) + futureSizes.reduce((a, b) => a + b + 1, 0);
  while (total > HISTORY_MAX_BYTES && past.length > 1) {
    past.shift();
    total -= pastSizes.shift()! + 1;
  }
  while (total > HISTORY_MAX_BYTES && future.length > 0) {
    future.pop();
    total -= futureSizes.pop()! + 1;
  }
  return { past, future };
}

/** Before an edit: remember the current state; a new edit ends any redo branch. */
export function record(h: History, current: LayoutSnapshot): History {
  const { past } = clean(h);
  return fit({ past: [...past, current].slice(-HISTORY_LIMIT), future: [] });
}

export function undo(h: History, current: LayoutSnapshot): { history: History; restore: LayoutSnapshot } | null {
  const { past, future } = clean(h);
  if (past.length === 0) return null;
  return {
    restore: past[past.length - 1],
    history: fit({ past: past.slice(0, -1), future: [current, ...future].slice(0, HISTORY_LIMIT) }),
  };
}

export function redo(h: History, current: LayoutSnapshot): { history: History; restore: LayoutSnapshot } | null {
  const { past, future } = clean(h);
  if (future.length === 0) return null;
  return {
    restore: future[0],
    history: fit({ past: [...past, current].slice(-HISTORY_LIMIT), future: future.slice(1) }),
  };
}

export function historyState(h: History | null | undefined): { canUndo: boolean; canRedo: boolean } {
  const { past, future } = clean(h);
  return { canUndo: past.length > 0, canRedo: future.length > 0 };
}
