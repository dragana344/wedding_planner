import { describe, it, expect } from "vitest";
import { coupleReminderApplies, coupleReminderDue, daysUntil, timelineStage } from "@/lib/menu-timeline";

const today = "2030-06-01";
function inDays(n: number): string {
  const d = new Date(Date.UTC(2030, 5, 1 + n));
  return d.toISOString().slice(0, 10);
}
const stage = (n: number, o: { createdDate?: string; sent?: boolean } = {}) =>
  timelineStage({ eventDate: inDays(n), createdDate: o.createdDate ?? "2029-01-01", today, sent: o.sent ?? false });

describe("daysUntil", () => {
  it("counts calendar days", () => {
    expect(daysUntil("2030-06-02", "2030-06-01")).toBe(1);
    expect(daysUntil("2030-06-01", "2030-06-01")).toBe(0);
    expect(daysUntil("2030-05-31", "2030-06-01")).toBe(-1);
    expect(daysUntil("2031-01-01", "2030-01-01")).toBe(365);
    expect(daysUntil("2030-03-31", "2030-03-30")).toBe(1); // no DST drift
  });
});

describe("timelineStage", () => {
  it("is none beyond 25 days", () => {
    expect(stage(26)).toBe("none");
  });
  it("couple_reminder 25..21", () => {
    expect(stage(25)).toBe("couple_reminder");
    expect(stage(21)).toBe("couple_reminder");
  });
  it("venue_can_remind 20..16", () => {
    expect(stage(20)).toBe("venue_can_remind");
    expect(stage(16)).toBe("venue_can_remind");
  });
  it("auto_send at 15 and below", () => {
    expect(stage(15)).toBe("auto_send");
    expect(stage(0)).toBe("auto_send");
  });
  it("none for past events", () => {
    expect(stage(-1)).toBe("none");
  });
  it("too_late_for_auto when created within 15 days of the event", () => {
    expect(stage(10, { createdDate: inDays(-5) })).toBe("too_late_for_auto"); // 15 days
    expect(stage(10, { createdDate: inDays(-6) })).toBe("auto_send"); // 16 days
    expect(stage(10, { createdDate: inDays(0) })).toBe("too_late_for_auto");
  });
  it("none once sent", () => {
    for (const n of [25, 18, 10, 0]) expect(stage(n, { sent: true })).toBe("none");
  });
});

describe("couple reminder for late events", () => {
  it("applies only when the event was created at least 25 days before it", () => {
    expect(coupleReminderApplies("2030-06-26", "2030-06-01")).toBe(true); // 25 days
    expect(coupleReminderApplies("2030-06-25", "2030-06-01")).toBe(false); // 24 days
  });
  it("is due 25..16 days out, unsent, and only for events created in time", () => {
    const due = (n: number, o: { createdDate?: string; sent?: boolean } = {}) =>
      coupleReminderDue({ eventDate: inDays(n), createdDate: o.createdDate ?? "2029-01-01", today, sent: o.sent ?? false });
    expect(due(26)).toBe(false);
    expect(due(25)).toBe(true);
    expect(due(16)).toBe(true);
    expect(due(15)).toBe(false);
    expect(due(20, { sent: true })).toBe(false);
    expect(due(20, { createdDate: inDays(-5) })).toBe(true); // created 25 days before
    expect(due(20, { createdDate: inDays(-4) })).toBe(false); // created 24 days before
  });
  it("leaves the venue's stages alone for late events", () => {
    expect(stage(20, { createdDate: inDays(-4) })).toBe("venue_can_remind");
  });
});
