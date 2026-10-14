// @vitest-environment node
import { describe, it, expect } from "vitest";
import { parseOverviewFilters } from "@/lib/admin/overview-filters";
import { todayIn } from "@/lib/date";

describe("parseOverviewFilters", () => {
  it("parses a valid signups range", () => {
    expect(parseOverviewFilters({ signupsFrom: "2028-01-01", signupsTo: "2028-01-31" })).toEqual({
      signups: { from: "2028-01-01", to: "2028-01-31" },
      actions: undefined,
    });
  });

  it("parses a valid actions range independently", () => {
    expect(parseOverviewFilters({ actionsFrom: "2028-02-01", actionsTo: "2028-02-07" })).toEqual({
      signups: undefined,
      actions: { from: "2028-02-01", to: "2028-02-07" },
    });
  });

  it("defaults a missing/blank 'to' to today, so a start date alone still searches", () => {
    expect(parseOverviewFilters({ signupsFrom: "2000-01-01" }).signups).toEqual({ from: "2000-01-01", to: todayIn() });
  });

  it("still drops a range with no 'from' at all", () => {
    expect(parseOverviewFilters({ signupsTo: "2028-01-31" }).signups).toBeUndefined();
  });

  it("drops a malformed date", () => {
    expect(parseOverviewFilters({ signupsFrom: "2028-13-40", signupsTo: "2028-01-31" }).signups).toBeUndefined();
  });

  it("drops an inverted range (from after to)", () => {
    expect(parseOverviewFilters({ signupsFrom: "2028-02-01", signupsTo: "2028-01-01" }).signups).toBeUndefined();
  });

  it("returns both undefined when nothing is given", () => {
    expect(parseOverviewFilters({})).toEqual({ signups: undefined, actions: undefined });
  });
});
