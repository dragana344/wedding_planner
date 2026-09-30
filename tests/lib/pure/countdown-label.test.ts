import { describe, it, expect } from "vitest";
import { dayCountdown } from "@/lib/couple/invitation-program";

describe("dayCountdown (A19)", () => {
  it("counts days until the event in Skopje, then says tomorrow and today", () => {
    expect(dayCountdown("2027-06-12", new Date("2027-05-13T10:00:00Z"))).toEqual({ kind: "days", days: 30 });
    expect(dayCountdown("2027-06-12", new Date("2027-06-02T10:00:00Z"))).toEqual({ kind: "days", days: 10 });
    expect(dayCountdown("2027-06-12", new Date("2027-06-11T10:00:00Z"))).toEqual({ kind: "tomorrow" });
    expect(dayCountdown("2027-06-12", new Date("2027-06-11T22:30:00Z"))).toEqual({ kind: "today" }); // 00:30 in Skopje
    expect(dayCountdown("2027-06-12", new Date("2027-06-13T10:00:00Z"))).toEqual({ kind: "past" });
  });
});
