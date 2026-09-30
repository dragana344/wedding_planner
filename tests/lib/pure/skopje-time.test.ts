import { describe, it, expect } from "vitest";
import { isoToSkopjeLocal, skopjeLocalToIso } from "@/lib/skopje-time";

describe("Skopje wall-clock time (A10)", () => {
  it("converts a datetime-local value in Skopje to UTC, summer and winter", () => {
    expect(skopjeLocalToIso("2027-07-05T10:00")).toBe("2027-07-05T08:00:00.000Z"); // CEST
    expect(skopjeLocalToIso("2027-01-05T10:00")).toBe("2027-01-05T09:00:00.000Z"); // CET
  });

  it("shows a UTC instant as Skopje wall-clock time for a datetime-local input", () => {
    expect(isoToSkopjeLocal("2027-07-05T08:00:00.000Z")).toBe("2027-07-05T10:00");
    expect(isoToSkopjeLocal("2027-01-05T09:00:00.000Z")).toBe("2027-01-05T10:00");
  });

  it("round-trips across the DST change", () => {
    for (const local of ["2027-03-28T01:30", "2027-03-28T04:00", "2027-10-31T04:00", "2027-12-31T23:59"]) {
      expect(isoToSkopjeLocal(skopjeLocalToIso(local))).toBe(local);
    }
  });
});
