import { describe, it, expect } from "vitest";
import {
  emptyRoomHistory,
  recordRoom,
  undoRoom,
  redoRoom,
  ROOM_HISTORY_LIMIT,
  ROOM_HISTORY_MAX_BYTES,
  type RoomLayoutSnapshot,
  type RoomHistory,
} from "@/lib/seating/room-history";

function snap(n: number): RoomLayoutSnapshot {
  return { elements: [{ id: `e${n}` } as never], fixed: [] };
}

function recordMany(count: number): { h: RoomHistory; current: RoomLayoutSnapshot } {
  let h = emptyRoomHistory();
  for (let i = 0; i < count; i++) h = recordRoom(h, snap(i));
  return { h, current: snap(count) };
}

describe("room layout history", () => {
  it("undoes steps back in reverse order", () => {
    let { h, current } = recordMany(25);
    for (let i = 24; i >= 5; i--) {
      const step = undoRoom(h, current)!;
      expect(step.restore).toEqual(snap(i));
      h = step.history;
      current = step.restore;
    }
    expect(h.past).toHaveLength(5);
    expect(h.future).toHaveLength(20);
  });

  it("redo returns to the state before the undo", () => {
    const { h, current } = recordMany(3);
    const back = undoRoom(h, current)!;
    const forward = redoRoom(back.history, back.restore)!;
    expect(forward.restore).toEqual(current);
    expect(forward.history.past).toEqual(h.past);
    expect(forward.history.future).toEqual([]);
  });

  it("a new edit after undo drops the redo branch", () => {
    const { h, current } = recordMany(3);
    const back = undoRoom(h, current)!;
    const edited = recordRoom(back.history, back.restore);
    expect(edited.future).toEqual([]);
    expect(redoRoom(edited, snap(99))).toBeNull();
  });

  it(`keeps at most ${ROOM_HISTORY_LIMIT} steps, dropping the oldest`, () => {
    const { h } = recordMany(ROOM_HISTORY_LIMIT + 1);
    expect(h.past).toHaveLength(ROOM_HISTORY_LIMIT);
    expect(h.past[0]).toEqual(snap(1));
  });

  it("undo and redo on an empty history do nothing", () => {
    expect(undoRoom(emptyRoomHistory(), snap(0))).toBeNull();
    expect(redoRoom(emptyRoomHistory(), snap(0))).toBeNull();
  });

  it("tolerates a malformed stored history", () => {
    const broken = { past: "x", future: null } as unknown as RoomHistory;
    expect(undoRoom(broken, snap(0))).toBeNull();
    expect(recordRoom(broken, snap(1)).past).toEqual([snap(1)]);
  });

  it("keeps the stored history under its byte budget (large halls)", () => {
    const big = (n: number): RoomLayoutSnapshot => ({
      elements: Array.from({ length: 60 }, (_, i) => ({ id: `e${n}-${i}`, label: "x".repeat(40) }) as never),
      fixed: Array.from({ length: 20 }, (_, i) => ({ id: `f${n}-${i}`, label: "y".repeat(40) }) as never),
    });
    let h = emptyRoomHistory();
    for (let i = 0; i < ROOM_HISTORY_LIMIT; i++) h = recordRoom(h, big(i));
    expect(JSON.stringify(h).length).toBeLessThanOrEqual(ROOM_HISTORY_MAX_BYTES);
    expect(h.past.length).toBeGreaterThan(0);
    expect(h.past[h.past.length - 1]).toEqual(big(ROOM_HISTORY_LIMIT - 1)); // newest kept
    const back = undoRoom(h, big(99))!;
    expect(JSON.stringify(back.history).length).toBeLessThanOrEqual(ROOM_HISTORY_MAX_BYTES);
  });
});
