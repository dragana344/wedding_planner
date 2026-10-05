import { describe, it, expect } from "vitest";
import { formatMkDate, formatVenueDateTime } from "@/lib/date";
import { formatDen } from "@/lib/money";
import { depositExceedsTotal } from "@/lib/venue/events";
import { isPhoneNumber } from "@/lib/venue/venue-profile";

describe("formatMkDate", () => {
  it("writes an ISO date the way people read it", () => {
    expect(formatMkDate("2026-11-14")).toBe("14 ноември 2026");
    expect(formatMkDate("2027-01-05T10:00:00Z")).toBe("5 јануари 2027");
  });
  it("leaves anything else untouched", () => {
    expect(formatMkDate("наскоро")).toBe("наскоро");
    expect(formatMkDate("2026-13-01")).toBe("2026-13-01");
  });
});

describe("depositExceedsTotal", () => {
  it("flags a deposit above the agreed price", () => {
    expect(depositExceedsTotal("120000", "200000")).toBe(true);
  });
  it("accepts a smaller or equal deposit, and blank fields", () => {
    expect(depositExceedsTotal("120000", "120000")).toBe(false);
    expect(depositExceedsTotal("120000", "20000")).toBe(false);
    expect(depositExceedsTotal("", "20000")).toBe(false);
    expect(depositExceedsTotal("120000", "")).toBe(false);
  });
});

describe("isPhoneNumber", () => {
  it("accepts the usual ways a number is written", () => {
    for (const ok of ["070123456", "+389 70 123 456", "(02) 3123-456", "02/3123456"]) expect(isPhoneNumber(ok), ok).toBe(true);
  });
  it("refuses text and numbers that are too short", () => {
    for (const bad of ["abc-not-a-phone", "12345", "+", "070 123 456 ext. 5"]) expect(isPhoneNumber(bad), bad).toBe(false);
  });
});

describe("formatVenueDateTime", () => {
  it("prints the instant in Skopje time, the same on every runtime", () => {
    expect(formatVenueDateTime("2026-10-05T11:40:00Z")).toBe("5.10.2026");
    expect(formatVenueDateTime("2026-10-05T11:40:00Z", { time: true })).toBe("5.10.2026 13:40");
    expect(formatVenueDateTime("2026-12-31T23:30:00Z", { year: false, time: true })).toBe("1.1 00:30");
  });
  it("leaves an invalid value untouched", () => {
    expect(formatVenueDateTime("наскоро")).toBe("наскоро");
  });
});

describe("formatDen", () => {
  it("groups thousands with dots and names the currency", () => {
    expect(formatDen(120000)).toBe("120.000 ден");
    expect(formatDen(950)).toBe("950 ден");
    expect(formatDen(1234567.4)).toBe("1.234.567 ден");
    expect(formatDen(-80000)).toBe("-80.000 ден");
    expect(formatDen(0)).toBe("0 ден");
  });
});
