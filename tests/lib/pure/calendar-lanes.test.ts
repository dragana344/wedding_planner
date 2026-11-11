import { describe, it, expect } from "vitest";
import { assignLanes } from "@/lib/venue/calendar-lanes";

type Ev = { id: string; start: number; end: number };
const lanesOf = (events: Ev[]) => {
  const m = assignLanes(events, (e) => e);
  return Object.fromEntries(events.map((e) => [e.id, m.get(e)]));
};

describe("assignLanes", () => {
  it("gives a lone event the full width", () => {
    expect(lanesOf([{ id: "a", start: 600, end: 900 }])).toEqual({ a: { lane: 0, lanes: 1 } });
  });

  it("puts two overlapping events side by side", () => {
    expect(lanesOf([{ id: "a", start: 1080, end: 1440 }, { id: "b", start: 1140, end: 1380 }])).toEqual({
      a: { lane: 0, lanes: 2 },
      b: { lane: 1, lanes: 2 },
    });
  });

  it("keeps back-to-back events full width", () => {
    expect(lanesOf([{ id: "a", start: 600, end: 720 }, { id: "b", start: 720, end: 900 }])).toEqual({
      a: { lane: 0, lanes: 1 },
      b: { lane: 0, lanes: 1 },
    });
  });

  it("reuses a freed lane inside a chained group, and same-time events still split", () => {
    const r = lanesOf([
      { id: "a", start: 600, end: 800 },
      { id: "b", start: 700, end: 1000 },
      { id: "c", start: 850, end: 950 },
      { id: "d", start: 1200, end: 1300 },
      { id: "e", start: 1200, end: 1300 },
    ]);
    expect(r.a).toEqual({ lane: 0, lanes: 2 });
    expect(r.b).toEqual({ lane: 1, lanes: 2 });
    expect(r.c).toEqual({ lane: 0, lanes: 2 });
    expect(r.d).toEqual({ lane: 0, lanes: 2 });
    expect(r.e).toEqual({ lane: 1, lanes: 2 });
  });
});
