// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { rangesOverlap } from "@/lib/venue/reservations";
import { matchGuestByName } from "@/lib/couple/rsvp-match";
import { computeChecklistStats } from "@/lib/couple/checklist";
import { deriveNoteDisplay } from "@/lib/couple/note-display";
import { formatTimeRange } from "@/lib/venue/event-display";
import { getInvitationTemplate } from "@/lib/couple/invitation-templates";
import { getBudgetCategoryLabel } from "@/lib/couple/budget-categories";
import { generateRandomPassword } from "@/lib/venue/credentials";
import { isUuid } from "@/lib/api/schemas";
import { routeLabel, isUserFacingError } from "@/lib/api/handler";

// TEST-009: the decision logic in lib/, tested without a database.

afterEach(() => {
  vi.useRealTimers();
});

describe("rangesOverlap (reservations)", () => {
  it("detects plain overlaps and allows back-to-back bookings", () => {
    expect(rangesOverlap("12:00", "15:00", "14:00", "16:00")).toBe(true);
    expect(rangesOverlap("12:00", "15:00", "15:00", "18:00")).toBe(false);
  });
  it("treats a missing end as a 3-hour block", () => {
    expect(rangesOverlap("18:00", null, "20:59", "22:00")).toBe(true);
    expect(rangesOverlap("18:00", null, "21:00", "22:00")).toBe(false);
  });
  it("handles bookings that cross midnight", () => {
    expect(rangesOverlap("22:00", "02:00", "01:00", "03:00")).toBe(true);
    expect(rangesOverlap("22:00", "02:00", "02:00", "04:00")).toBe(false);
  });
});

describe("matchGuestByName (public RSVP)", () => {
  const guests = [
    { id: "1", full_name: "Ана Петровска" },
    { id: "2", full_name: "Марко Илиевски" },
    { id: "3", full_name: "Марко Илиевски " },
  ];
  it("matches trimmed and case-insensitively", () => {
    expect(matchGuestByName(guests, "  ана петровска ")?.id).toBe("1");
  });
  it("refuses ambiguous and unknown names", () => {
    expect(matchGuestByName(guests, "Марко Илиевски")).toBeNull();
    expect(matchGuestByName(guests, "Непознат Гостин")).toBeNull();
  });
  it("matches a Latin spelling of a Cyrillic name, and extra spaces", () => {
    expect(matchGuestByName(guests, "Ana Petrovska")?.id).toBe("1");
    expect(matchGuestByName(guests, "ANA   PETROVSKA")?.id).toBe("1");
    const more = [{ id: "7", full_name: "Жаклина Чочова" }, { id: "8", full_name: "Ѓорѓи Шишков" }, { id: "9", full_name: "Petar Petrovski" }];
    expect(matchGuestByName(more, "Zaklina Cocova")?.id).toBe("7");
    expect(matchGuestByName(more, "Zhaklina Chochova")?.id).toBe("7");
    expect(matchGuestByName(more, "Žaklina Čočova")?.id).toBe("7");
    expect(matchGuestByName(more, "Gjorgji Shishkov")?.id).toBe("8");
    expect(matchGuestByName(more, "Петар Петровски")?.id).toBe("9");
  });
  it("still refuses a Latin spelling that fits two guests", () => {
    expect(matchGuestByName(guests, "Marko Ilievski")).toBeNull();
    expect(matchGuestByName([{ id: "1", full_name: "Жана Зорова" }, { id: "2", full_name: "Зана Зорова" }], "Zana Zorova")).toBeNull();
  });
  it("prefers the exact spelling over a loose one", () => {
    expect(matchGuestByName([{ id: "1", full_name: "Жана Зорова" }, { id: "2", full_name: "Зана Зорова" }], "Зана Зорова")?.id).toBe("2");
  });
});

describe("computeChecklistStats", () => {
  it("counts overdue items by the venue's local date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T22:30:00Z")); // already the 15th in Skopje
    const stats = computeChecklistStats([
      { id: "a", event_id: "e", title: "t", due_date: "2026-06-14", is_done: false },
      { id: "b", event_id: "e", title: "t", due_date: "2026-06-15", is_done: false },
      { id: "c", event_id: "e", title: "t", due_date: "2026-06-01", is_done: true },
      { id: "d", event_id: "e", title: "t", due_date: null, is_done: false },
    ] as Parameters<typeof computeChecklistStats>[0]);
    expect(stats).toEqual({ total: 4, open: 3, done: 1, overdue: 1 });
  });
});

describe("display helpers", () => {
  it("derives note titles like Apple Notes", () => {
    expect(deriveNoteDisplay(null, "\n\nЦвеќиња\nНарачај до петок")).toEqual({ title: "Цвеќиња", preview: "Нарачај до петок" });
    expect(deriveNoteDisplay("  ", "  ")).toEqual({ title: "Белешка без наслов", preview: "" });
  });
  it("formats time ranges", () => {
    expect(formatTimeRange(null, null)).toBeNull();
    expect(formatTimeRange("19:00:00", "02:00:00")).toMatch(/19:00.*02:00/);
  });
  it("falls back to a default invitation template and labels budget categories", () => {
    expect(getInvitationTemplate("does-not-exist").id).toBeTruthy();
    expect(getBudgetCategoryLabel("catering")).not.toBe("catering");
  });
});

describe("security helpers", () => {
  it("generates couple passwords that meet the 10-character minimum", () => {
    for (let i = 0; i < 1000; i++) expect(generateRandomPassword()).toMatch(/^[a-z0-9]{10,}$/);
  });
  it("accepts only UUIDs as ids", () => {
    expect(isUuid("5ba746ab-24cf-42ac-8ec6-83531a7100a0")).toBe(true);
    expect(isUuid("x),menu_item_id.not.is.null")).toBe(false);
  });
  it("never logs invitation slugs or ids in route labels", () => {
    expect(routeLabel(new Request("http://x/api/invite/Xy12_abc/rsvp"))).toBe("/api/invite/:slug/rsvp");
    expect(routeLabel(new Request("http://x/api/couple/guests/5ba746ab-24cf-42ac-8ec6-83531a7100a0"))).toBe("/api/couple/guests/:id");
  });
  it("shows only intentional error messages to users", () => {
    expect(isUserFacingError(new Error("Invitation not found."))).toBe(true);
    expect(isUserFacingError(Object.assign(new Error("duplicate key"), { code: "23505" }))).toBe(false);
    expect(isUserFacingError(new TypeError("x is undefined"))).toBe(false);
  });
});
