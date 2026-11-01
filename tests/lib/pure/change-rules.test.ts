import { describe, it, expect } from "vitest";
import { unseenChanges, groupBySection, sideName, SECTION_LABELS, SECTIONS_FOR_VIEWER } from "@/lib/changes/rules";
import type { EventChange } from "@/lib/changes/types";

let n = 0;
function change(over: Partial<EventChange> = {}): EventChange {
  n += 1;
  return {
    id: `c${n}`, eventId: "e1", section: "guest_count", side: "venue", changedBy: null, field: "guest_count",
    oldValue: { count: 1 }, newValue: { count: 2 }, changedAt: "2030-01-10T10:00:00Z", ...over,
  };
}
const opts = { eventDate: "2030-06-01", today: "2030-01-15", coupleFirstLoginAt: "2030-01-01T00:00:00Z" };

describe("unseenChanges", () => {
  it("shows only the other side's changes", () => {
    const mine = change({ side: "couple" });
    const theirs = change({ side: "venue" });
    expect(unseenChanges([mine, theirs], "couple", {}, opts)).toEqual([theirs]);
    expect(unseenChanges([mine, theirs], "venue", {}, opts)).toEqual([mine]);
  });

  it("limits the venue to guest count and contact, the couple to all six", () => {
    const sections = ["date_time", "rooms", "menus", "guest_count", "contact", "finance"] as const;
    const all = sections.map((section) => change({ section, side: "couple" }));
    expect(unseenChanges(all, "venue", {}, opts).map((c) => c.section)).toEqual(["guest_count", "contact"]);
    const fromVenue = sections.map((section) => change({ section, side: "venue" }));
    expect(unseenChanges(fromVenue, "couple", {}, opts)).toHaveLength(6);
  });

  it("counts only changes strictly newer than seen for that section", () => {
    const old = change({ changedAt: "2030-01-10T10:00:00Z" });
    const fresh = change({ changedAt: "2030-01-10T10:00:01Z" });
    const other = change({ section: "contact", changedAt: "2030-01-10T10:00:00Z" });
    const seen = { guest_count: "2030-01-10T10:00:00Z" };
    expect(unseenChanges([old, fresh, other], "couple", seen, opts)).toEqual([fresh, other]);
  });

  it("is empty for a past event", () => {
    expect(unseenChanges([change()], "couple", {}, { ...opts, eventDate: "2030-01-14" })).toEqual([]);
    expect(unseenChanges([change()], "couple", {}, { ...opts, eventDate: "2030-01-15" })).toHaveLength(1);
  });

  it("couple marks only count after the couple's first login; null means none", () => {
    const before = change({ changedAt: "2029-12-31T23:59:59Z" });
    const after = change({ changedAt: "2030-01-02T00:00:00Z" });
    expect(unseenChanges([before, after], "couple", {}, opts)).toEqual([after]);
    expect(unseenChanges([before, after], "couple", {}, { ...opts, coupleFirstLoginAt: null })).toEqual([]);
    // The venue is not subject to the couple's first login.
    const c = change({ side: "couple", changedAt: "2020-01-01T00:00:00Z" });
    expect(unseenChanges([c], "venue", {}, { ...opts, coupleFirstLoginAt: null })).toEqual([c]);
  });
});

describe("groupBySection", () => {
  it("groups and orders each list oldest first", () => {
    const a = change({ section: "rooms", changedAt: "2030-01-10T12:00:00Z" });
    const b = change({ section: "rooms", changedAt: "2030-01-10T11:00:00Z" });
    const c = change({ section: "menus" });
    const g = groupBySection([a, b, c]);
    expect(g.rooms).toEqual([b, a]);
    expect(g.menus).toEqual([c]);
    expect(g.finance).toBeUndefined();
  });
});

describe("sideName", () => {
  it("names the venue and the couple", () => {
    expect(sideName("venue", "Било кој")).toBe("Салата");
    expect(sideName("couple", "Ко-организатор")).toBe("Ко-организатор");
    expect(sideName("couple", null)).toBe("Младенците");
  });
});

describe("labels", () => {
  it("has the exact copy", () => {
    expect(SECTION_LABELS).toEqual({
      date_time: "Датум и време", rooms: "Простории", menus: "Мени", guest_count: "Број на гости",
      contact: "Контакт", finance: "Финансии", menu_numbers: "Бројки за мени", guest_replies: "Одговори од гости",
    });
    expect(SECTIONS_FOR_VIEWER.venue).toEqual(["guest_count", "contact"]);
  });
});
