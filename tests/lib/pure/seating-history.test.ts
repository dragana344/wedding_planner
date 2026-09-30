import { describe, it, expect } from "vitest";
import { emptyHistory, record, undo, redo, HISTORY_LIMIT, HISTORY_MAX_BYTES, type LayoutSnapshot, type History } from "@/lib/seating/history";

function snap(n: number): LayoutSnapshot {
  return { elements: [{ id: `e${n}` } as never], seats: [] };
}

function recordMany(count: number): { h: History; current: LayoutSnapshot } {
  let h = emptyHistory();
  for (let i = 0; i < count; i++) h = record(h, snap(i));
  return { h, current: snap(count) };
}

describe("seating history", () => {
  it("undoes 20 steps back in reverse order", () => {
    let { h, current } = recordMany(25);
    for (let i = 24; i >= 5; i--) {
      const step = undo(h, current)!;
      expect(step.restore).toEqual(snap(i));
      h = step.history;
      current = step.restore;
    }
    expect(h.past).toHaveLength(5);
    expect(h.future).toHaveLength(20);
  });

  it("redo returns to the state before the undo", () => {
    const { h, current } = recordMany(3);
    const back = undo(h, current)!;
    const forward = redo(back.history, back.restore)!;
    expect(forward.restore).toEqual(current);
    expect(forward.history.past).toEqual(h.past);
    expect(forward.history.future).toEqual([]);
  });

  it("a new edit after undo drops the redo branch", () => {
    const { h, current } = recordMany(3);
    const back = undo(h, current)!;
    const edited = record(back.history, back.restore);
    expect(edited.future).toEqual([]);
    expect(redo(edited, snap(99))).toBeNull();
  });

  it(`keeps at most ${HISTORY_LIMIT} steps, dropping the oldest`, () => {
    const { h } = recordMany(HISTORY_LIMIT + 1);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toEqual(snap(1));
  });

  it("undo and redo on an empty history do nothing", () => {
    expect(undo(emptyHistory(), snap(0))).toBeNull();
    expect(redo(emptyHistory(), snap(0))).toBeNull();
  });

  it("tolerates a malformed stored history", () => {
    const broken = { past: "x", future: null } as unknown as History;
    expect(undo(broken, snap(0))).toBeNull();
    expect(record(broken, snap(1)).past).toEqual([snap(1)]);
  });

  it("keeps the stored history under its byte budget (large halls)", () => {
    const big = (n: number): LayoutSnapshot => ({
      elements: Array.from({ length: 60 }, (_, i) => ({ id: `e${n}-${i}`, label: "x".repeat(40) }) as never),
      seats: Array.from({ length: 500 }, (_, i) => ({ layout_element_id: `t${i % 50}`, seat_number: i, guest_id: null, guest_name: "Гостин Гостиновски" })),
    });
    let h = emptyHistory();
    for (let i = 0; i < HISTORY_LIMIT; i++) h = record(h, big(i));
    expect(JSON.stringify(h).length).toBeLessThanOrEqual(HISTORY_MAX_BYTES);
    expect(h.past.length).toBeGreaterThan(0);
    expect(h.past[h.past.length - 1]).toEqual(big(HISTORY_LIMIT - 1)); // newest kept
    const back = undo(h, big(99))!;
    expect(JSON.stringify(back.history).length).toBeLessThanOrEqual(HISTORY_MAX_BYTES);
  });
});
