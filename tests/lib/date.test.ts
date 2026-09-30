// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { localIsoDate, todayIn } from "@/lib/date";

afterEach(() => {
  vi.useRealTimers();
});

describe("venue-local dates (REL-006)", () => {
  it("gives Skopje's date at 00:30 local time, when UTC is still on the previous day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T22:30:00Z")); // 00:30 CEST on the 15th
    expect(todayIn()).toBe("2026-06-15");
  });

  it("handles winter time (CET, UTC+1)", () => {
    expect(todayIn("Europe/Skopje", new Date("2026-01-09T23:30:00Z"))).toBe("2026-01-10");
    expect(todayIn("Europe/Skopje", new Date("2026-01-09T22:30:00Z"))).toBe("2026-01-09");
  });

  it("formats a Date's own calendar fields without shifting to UTC", () => {
    expect(localIsoDate(new Date(2026, 5, 15))).toBe("2026-06-15");
  });
});
