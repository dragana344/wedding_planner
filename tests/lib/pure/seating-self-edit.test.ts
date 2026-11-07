import { describe, it, expect } from "vitest";
import { effectiveSeatingSelfEditEnabled } from "@/lib/seating/self-edit";

// Project A §4: the venue-wide switch always wins when false; a null
// per-event override follows the venue-wide switch either way.
describe("effectiveSeatingSelfEditEnabled", () => {
  it("is enabled when the venue allows it and the event has no override", () => {
    expect(effectiveSeatingSelfEditEnabled(true, null)).toBe(true);
  });

  it("is disabled when the venue-wide switch is off, regardless of the event override", () => {
    expect(effectiveSeatingSelfEditEnabled(false, null)).toBe(false);
    expect(effectiveSeatingSelfEditEnabled(false, true)).toBe(false);
    expect(effectiveSeatingSelfEditEnabled(false, false)).toBe(false);
  });

  it("the per-event override wins when the venue allows it", () => {
    expect(effectiveSeatingSelfEditEnabled(true, true)).toBe(true);
    expect(effectiveSeatingSelfEditEnabled(true, false)).toBe(false);
  });
});
