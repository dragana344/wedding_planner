import { describe, it, expect } from "vitest";
import { splitCoupleNames, eventStartInstant, eventEndInstant, heroPhase } from "@/lib/couple/event-hero";

describe("splitCoupleNames", () => {
  it("splits on the Macedonian conjunction", () => {
    expect(splitCoupleNames("Ивана и Марко")).toEqual({ first: "Ивана", sep: "и", second: "Марко" });
  });

  it("splits on an ampersand", () => {
    expect(splitCoupleNames("Ivana & Marko")).toEqual({ first: "Ivana", sep: "&", second: "Marko" });
  });

  it("returns null when there's nothing to split on", () => {
    expect(splitCoupleNames("Семејство Петровски")).toBeNull();
  });
});

describe("eventStartInstant", () => {
  it("builds the Skopje wall-clock instant from the date and time", () => {
    // Skopje is UTC+2 in October (summer time).
    expect(eventStartInstant("2026-10-18", "19:00:00").toISOString()).toBe("2026-10-18T17:00:00.000Z");
  });

  it("falls back to midnight when there's no recorded start time", () => {
    expect(eventStartInstant("2026-10-18", null).toISOString()).toBe("2026-10-17T22:00:00.000Z");
  });
});

describe("eventEndInstant", () => {
  it("builds same-day end when end is after start", () => {
    expect(eventEndInstant("2026-10-18", "19:00:00", "23:00:00").toISOString()).toBe("2026-10-18T21:00:00.000Z");
  });

  it("rolls over to the next day when end is at/before start (past midnight)", () => {
    expect(eventEndInstant("2026-10-18", "19:00:00", "02:00:00").toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("treats a missing end time as lasting until midnight after the event date", () => {
    expect(eventEndInstant("2026-10-18", "19:00:00", null).toISOString()).toBe("2026-10-18T22:00:00.000Z");
  });
});

describe("heroPhase", () => {
  const start = new Date("2026-10-18T17:00:00.000Z");
  const end = new Date("2026-10-19T00:00:00.000Z");

  it("counts down when now is before the start", () => {
    const now = new Date(start.getTime() - (2 * 86_400_000 + 3 * 3_600_000 + 15 * 60_000));
    expect(heroPhase(now, start, end)).toEqual({ kind: "countdown", days: 2, hours: 3, minutes: 15 });
  });

  it("reports 'today' once the event has started but not ended", () => {
    const now = new Date(start.getTime() + 60_000);
    expect(heroPhase(now, start, end)).toEqual({ kind: "today" });
  });

  it("reports 'today' at the exact start instant", () => {
    expect(heroPhase(start, start, end)).toEqual({ kind: "today" });
  });

  it("reports 'past' once the event has ended", () => {
    const now = new Date(end.getTime() + 60_000);
    expect(heroPhase(now, start, end)).toEqual({ kind: "past" });
  });
});
