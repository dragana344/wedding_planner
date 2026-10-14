// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseNotificationsFilters } from "@/lib/venue/notifications-filters";
import { todayIn } from "@/lib/date";

describe("parseNotificationsFilters", () => {
  it("parses a valid range", () => {
    expect(parseNotificationsFilters({ notifFrom: "2028-01-01", notifTo: "2028-01-31" })).toEqual({ from: "2028-01-01", to: "2028-01-31" });
  });

  it("defaults a missing/blank 'to' to today, so a start date alone still searches", () => {
    expect(parseNotificationsFilters({ notifFrom: "2000-01-01" })).toEqual({ from: "2000-01-01", to: todayIn() });
  });

  it("still drops a range with no 'from' at all", () => {
    expect(parseNotificationsFilters({ notifTo: "2028-01-31" })).toBeUndefined();
  });

  it("drops a malformed date", () => {
    expect(parseNotificationsFilters({ notifFrom: "2028-13-40", notifTo: "2028-01-31" })).toBeUndefined();
  });

  it("drops an inverted range", () => {
    expect(parseNotificationsFilters({ notifFrom: "2028-02-01", notifTo: "2028-01-01" })).toBeUndefined();
  });

  it("returns undefined for nothing given", () => {
    expect(parseNotificationsFilters({})).toBeUndefined();
  });
});
