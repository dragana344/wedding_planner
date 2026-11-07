import { describe, it, expect } from "vitest";
import { fitZoom } from "@/lib/seating/zoom-to-fit";

// Project C: a wide room starts zoomed to fit instead of overflowing into a
// horizontal scrollbar at 100%.
describe("fitZoom", () => {
  it("stays at 100% when the room already fits", () => {
    expect(fitZoom(2000, 0.4, 1000)).toBe(1); // 800px room, 1000px available
    expect(fitZoom(2000, 0.4, 800)).toBe(1); // exactly fits
  });

  it("shrinks to fit a wider room, rounded to two decimals", () => {
    expect(fitZoom(4000, 0.4, 800)).toBe(0.5); // 1600px room into 800px
    expect(fitZoom(3000, 0.4, 900)).toBe(0.75); // 1200px room into 900px
  });

  it("never shrinks past the given floor, even for a very wide room", () => {
    expect(fitZoom(10000, 0.4, 500)).toBe(0.5); // would compute 0.125 unfloored
    expect(fitZoom(10000, 0.4, 500, 0.3)).toBe(0.3);
  });

  it("stays at 100% when there's nothing to measure yet (container not mounted)", () => {
    expect(fitZoom(4000, 0.4, 0)).toBe(1);
  });
});
