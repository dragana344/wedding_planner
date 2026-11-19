import { describe, it, expect } from "vitest";
import {
  coupleDeadlineText,
  effectiveRsvpDeadline,
  formatDeadline,
  invitationPhase,
  minusDays,
  needsReconfirm,
  rsvpDeadlineResets,
} from "@/lib/rsvp-deadline";

// Group B task 2 (0180): the venue's answer deadline and the invitation's states.

describe("effectiveRsvpDeadline", () => {
  it("is the event's own date when set, otherwise N calendar days before", () => {
    expect(effectiveRsvpDeadline("2027-06-12", null, 15)).toBe("2027-05-28");
    expect(effectiveRsvpDeadline("2027-06-12", "2027-06-01", 15)).toBe("2027-06-01");
    expect(effectiveRsvpDeadline("2027-06-12", undefined, 0)).toBe("2027-06-12");
  });

  it("counts across months, years and the spring/autumn clock change without drifting", () => {
    expect(minusDays("2027-03-10", 15)).toBe("2027-02-23");
    expect(minusDays("2027-01-05", 10)).toBe("2026-12-26");
    expect(minusDays("2027-04-05", 15)).toBe("2027-03-21");
    expect(minusDays("2027-11-05", 15)).toBe("2027-10-21");
    expect(minusDays("2028-03-01", 1)).toBe("2028-02-29");
  });
});

describe("invitationPhase", () => {
  const base = { eventDate: "2027-06-12", deadline: "2027-05-28", status: "confirmed" };
  it("is open up to and including the deadline day, closed after it", () => {
    expect(invitationPhase({ ...base, today: "2027-05-27" })).toBe("open");
    expect(invitationPhase({ ...base, today: "2027-05-28" })).toBe("open");
    expect(invitationPhase({ ...base, today: "2027-05-29" })).toBe("closed");
    expect(invitationPhase({ ...base, today: "2027-06-12" })).toBe("closed");
  });

  it("thanks the guests from the day after the event; a cancellation wins over everything", () => {
    expect(invitationPhase({ ...base, today: "2027-06-13" })).toBe("after");
    expect(invitationPhase({ ...base, status: "cancelled", today: "2027-05-01" })).toBe("cancelled");
    expect(invitationPhase({ ...base, status: "cancelled", today: "2027-07-01" })).toBe("cancelled");
  });
});

describe("couple's deadline line", () => {
  const base = { eventDate: "2027-06-12", deadline: "2027-05-28", status: "preparation" };
  it("says until when, then that it passed, then nothing", () => {
    expect(coupleDeadlineText({ ...base, today: "2027-05-01" })).toBe("Гостите можат да одговорат до 28.05.2027.");
    expect(coupleDeadlineText({ ...base, today: "2027-05-30" })).toMatch(/^Рокот за одговор на гостите помина \(28\.05\.2027\)/);
    expect(coupleDeadlineText({ ...base, today: "2027-06-13" })).toBeNull();
    expect(coupleDeadlineText({ ...base, status: "cancelled", today: "2027-05-01" })).toBeNull();
  });
});

describe("needsReconfirm", () => {
  const moved = "2027-03-01T10:00:00.000Z";
  it("asks a yes who answered before the date moved", () => {
    expect(needsReconfirm("confirmed", "2027-02-01T10:00:00Z", moved)).toBe(true);
    expect(needsReconfirm("confirmed", null, moved)).toBe(true);
  });
  it("not a yes after the move, not a no, and nobody when the date never moved", () => {
    expect(needsReconfirm("confirmed", "2027-03-01T10:00:01Z", moved)).toBe(false);
    expect(needsReconfirm("declined", "2027-02-01T10:00:00Z", moved)).toBe(false);
    expect(needsReconfirm("confirmed", "2027-02-01T10:00:00Z", null)).toBe(false);
  });
});

it("formats dd.mm.yyyy", () => {
  expect(formatDeadline("2027-06-02")).toBe("02.06.2027");
});

describe("rsvpDeadlineResets (0184)", () => {
  const base = { oldDate: "2027-06-30", oldDeadline: "2027-06-01", defaultDays: 15 };
  it("resets an untouched own deadline that falls before the later date's default", () => {
    expect(rsvpDeadlineResets({ ...base, newDate: "2027-07-30", newDeadline: "2027-06-01" })).toBe(true);
    expect(rsvpDeadlineResets({ ...base, newDate: "2027-07-30", newDeadline: undefined })).toBe(true);
  });
  it("keeps it when moved earlier, retyped, still after the default, or there is none", () => {
    expect(rsvpDeadlineResets({ ...base, newDate: "2027-06-20", newDeadline: "2027-06-01" })).toBe(false);
    expect(rsvpDeadlineResets({ ...base, newDate: "2027-07-30", newDeadline: "2027-07-01" })).toBe(false);
    expect(rsvpDeadlineResets({ ...base, oldDeadline: "2027-06-20", newDate: "2027-07-02", newDeadline: "2027-06-20" })).toBe(false);
    expect(rsvpDeadlineResets({ ...base, oldDeadline: null, newDate: "2027-07-30", newDeadline: null })).toBe(false);
  });
});
