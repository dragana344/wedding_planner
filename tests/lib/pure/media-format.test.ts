import { describe, it, expect } from "vitest";
import { formatDay, formatTime } from "@/lib/media/format";

describe("album date formatting", () => {
  it("shows the Skopje calendar day as dd.mm.yyyy", () => {
    expect(formatDay("2027-06-12T20:15:00Z")).toBe("12.06.2027");
    expect(formatDay("2027-06-12T23:30:00Z")).toBe("13.06.2027"); // after midnight in Skopje (UTC+2)
  });

  it("shows the Skopje time as HH:MM", () => {
    expect(formatTime("2027-06-12T20:15:00Z")).toBe("22:15");
  });
});
