// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseAuditFilters, startOfDaySkopjeIso, endOfDaySkopjeIso } from "@/lib/admin/audit-filters";

const VALID_UUID = "11111111-2222-3333-4444-555555555555";

describe("parseAuditFilters", () => {
  it("passes through every valid filter, defaulting page to 0", () => {
    expect(
      parseAuditFilters({
        venue: VALID_UUID,
        event: VALID_UUID,
        action: "admin_venue_blocked",
        actor: "admin",
        from: "2028-01-01",
        to: "2028-01-31",
      })
    ).toEqual({
      venueId: VALID_UUID,
      eventId: VALID_UUID,
      action: "admin_venue_blocked",
      actorType: "admin",
      from: "2028-01-01",
      to: "2028-01-31",
      page: 0,
    });
  });

  it("parses a valid page number", () => {
    expect(parseAuditFilters({ page: "2" }).page).toBe(2);
  });

  it("ignores a non-UUID venue or event id instead of passing it through", () => {
    const f = parseAuditFilters({ venue: "not-a-uuid", event: "../../etc/passwd" });
    expect(f.venueId).toBeUndefined();
    expect(f.eventId).toBeUndefined();
  });

  it("ignores an actor value outside the fixed enum", () => {
    expect(parseAuditFilters({ actor: "hacker" }).actorType).toBeUndefined();
    for (const a of ["admin", "staff", "couple", "guest", "system"]) {
      expect(parseAuditFilters({ actor: a }).actorType).toBe(a);
    }
  });

  it("ignores malformed or impossible from/to dates", () => {
    for (const bad of ["2028-13-40", "01/01/2028", "2028-02-30", "not-a-date", ""]) {
      expect(parseAuditFilters({ from: bad }).from, bad).toBeUndefined();
      expect(parseAuditFilters({ to: bad }).to, bad).toBeUndefined();
    }
  });

  it("ignores a negative, fractional, or non-numeric page and falls back to 0", () => {
    for (const bad of ["-1", "1.5", "abc", ""]) {
      expect(parseAuditFilters({ page: bad }).page, bad).toBe(0);
    }
  });

  it("rejects a page number longer than 6 digits instead of building a huge .range() offset", () => {
    expect(parseAuditFilters({ page: "999999999999999999999" }).page).toBe(0);
    expect(parseAuditFilters({ page: "9999999" }).page).toBe(0); // 7 digits
    expect(parseAuditFilters({ page: "999999" }).page).toBe(999999); // 6 digits, still accepted
  });

  it("drops an action filter longer than 100 characters", () => {
    const ok = "a".repeat(100);
    const tooLong = "a".repeat(101);
    expect(parseAuditFilters({ action: ok }).action).toBe(ok);
    expect(parseAuditFilters({ action: tooLong }).action).toBeUndefined();
  });

  it("never throws on garbage input, however it's shaped", () => {
    expect(() => parseAuditFilters({})).not.toThrow();
    expect(parseAuditFilters({})).toEqual({
      venueId: undefined,
      eventId: undefined,
      action: undefined,
      actorType: undefined,
      from: undefined,
      to: undefined,
      page: 0,
    });
  });
});

describe("endOfDaySkopjeIso", () => {
  it("returns the UTC instant for 23:59:59.999 Skopje time, winter (UTC+1)", () => {
    // Europe/Skopje is UTC+1 in January (CET) -> 23:59:59.999 local is
    // 22:59:59.999 UTC.
    expect(endOfDaySkopjeIso("2028-01-15")).toBe("2028-01-15T22:59:59.999Z");
  });

  it("returns the UTC instant for 23:59:59.999 Skopje time, summer (UTC+2)", () => {
    // CEST in July -> 23:59:59.999 local is 21:59:59.999 UTC.
    expect(endOfDaySkopjeIso("2028-07-15")).toBe("2028-07-15T21:59:59.999Z");
  });
});

describe("startOfDaySkopjeIso", () => {
  it("returns the UTC instant for 00:00:00.000 Skopje time, winter (UTC+1)", () => {
    // Skopje midnight Jan 15 CET (+1) is 2028-01-14 23:00 UTC.
    expect(startOfDaySkopjeIso("2028-01-15")).toBe("2028-01-14T23:00:00.000Z");
  });

  it("returns the UTC instant for 00:00:00.000 Skopje time, summer (UTC+2)", () => {
    // Skopje midnight Jul 15 CEST (+2) is 2028-07-14 22:00 UTC.
    expect(startOfDaySkopjeIso("2028-07-15")).toBe("2028-07-14T22:00:00.000Z");
  });

  it("brackets the same calendar date: start is strictly before end", () => {
    for (const d of ["2028-01-15", "2028-07-15"]) {
      expect(new Date(startOfDaySkopjeIso(d)).getTime()).toBeLessThan(new Date(endOfDaySkopjeIso(d)).getTime());
    }
  });
});
