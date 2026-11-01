import { describe, expect, it } from "vitest";
import { coupleNotice, newGuestReplies } from "@/lib/changes/couple-notice";
import type { EventChange } from "@/lib/changes/types";

const change = (id: string, changedAt: string): EventChange => ({
  id,
  eventId: "e1",
  section: "guest_count",
  side: "venue",
  changedBy: null,
  field: "count",
  oldValue: { count: 100 },
  newValue: { count: 120 },
  changedAt,
});

describe("coupleNotice", () => {
  it("is null without changes", () => {
    expect(coupleNotice("guest_count", [])).toBeNull();
    expect(coupleNotice("guest_count", undefined)).toBeNull();
  });

  it("titles with the section label, formats lines, and keeps the newest time unchanged", () => {
    const n = coupleNotice("guest_count", [change("a", "2026-10-31T10:00:00.111111+00:00"), change("b", "2026-10-31T12:30:00.222222+00:00")])!;
    expect(n.title).toBe("Број на гости");
    expect(n.upTo).toBe("2026-10-31T12:30:00.222222+00:00");
    expect(n.lines[0]).toEqual({ key: "a", text: "31.10.2026 11:00 · 100 → 120" });
  });
});

describe("newGuestReplies", () => {
  const replies = [{ at: "2026-10-30T10:00:00+00:00" }, { at: "2026-10-28T10:00:00+00:00" }];
  it("counts all replies when nothing was ever seen", () => {
    expect(newGuestReplies(replies, undefined, "2026-12-01", "2026-10-31")).toHaveLength(2);
  });
  it("counts only replies after the seen time", () => {
    expect(newGuestReplies(replies, "2026-10-29T00:00:00+00:00", "2026-12-01", "2026-10-31")).toEqual([replies[0]]);
  });
  it("counts nothing on a past event", () => {
    expect(newGuestReplies(replies, undefined, "2026-10-30", "2026-10-31")).toEqual([]);
  });
});
