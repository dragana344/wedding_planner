import { describe, it, expect } from "vitest";
import { coupleAccessEnd, coupleAccessPhase, coupleAccessUntil } from "@/lib/couple/access";

describe("coupleAccessEnd (0170)", () => {
  it("defaults to 6 months after the event date", () => {
    expect(coupleAccessEnd("2027-06-12", null)).toBe("2027-12-12");
    expect(coupleAccessEnd("2027-09-01", null)).toBe("2028-03-01");
  });

  it("clamps to the month's last day like Postgres date + interval", () => {
    expect(coupleAccessEnd("2027-08-31", null)).toBe("2028-02-29");
    expect(coupleAccessEnd("2026-08-31", null)).toBe("2027-02-28");
  });

  it("uses an explicit end date when there is one", () => {
    expect(coupleAccessEnd("2027-06-12", "2028-01-31")).toBe("2028-01-31");
  });
});

describe("coupleAccessUntil", () => {
  it("prefers the admin extension over the cancellation date", () => {
    expect(coupleAccessUntil({ couple_access_until: "2027-01-01", couple_access_extended_until: "2028-01-01" })).toBe("2028-01-01");
    expect(coupleAccessUntil({ couple_access_until: "2027-01-01", couple_access_extended_until: null })).toBe("2027-01-01");
    expect(coupleAccessUntil({ couple_access_until: null, couple_access_extended_until: null })).toBeNull();
  });
});

describe("coupleAccessPhase", () => {
  it("is active up to and including the event day", () => {
    expect(coupleAccessPhase("2027-06-12", null, "2027-01-01")).toBe("active");
    expect(coupleAccessPhase("2027-06-12", null, "2027-06-12")).toBe("active");
  });

  it("is memories from the day after the event through the end date", () => {
    expect(coupleAccessPhase("2027-06-12", null, "2027-06-13")).toBe("memories");
    expect(coupleAccessPhase("2027-06-12", null, "2027-12-12")).toBe("memories");
  });

  it("is closed after the end date", () => {
    expect(coupleAccessPhase("2027-06-12", null, "2027-12-13")).toBe("closed");
    expect(coupleAccessPhase("2027-06-12", "2028-03-01", "2028-03-01")).toBe("memories");
    expect(coupleAccessPhase("2027-06-12", "2028-03-01", "2028-03-02")).toBe("closed");
  });

  it("is closed when a cancellation ended access before the event day", () => {
    expect(coupleAccessPhase("2027-06-12", "2027-02-01", "2027-02-02")).toBe("closed");
    expect(coupleAccessPhase("2027-06-12", "2027-02-01", "2027-02-01")).toBe("active");
  });

  it("defaults today to the Skopje date", () => {
    expect(["active", "memories", "closed"]).toContain(coupleAccessPhase("2027-06-12", null));
  });
});
