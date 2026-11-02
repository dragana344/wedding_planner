import { describe, it, expect } from "vitest";
import { diffMenuNumbers, hasUnseenMenuNumbers, menuNumbersDiffer, toMenuSubmission } from "@/lib/menu-numbers";

const numbers = (menus: [string, string, number][]) => ({
  menus: menus.map(([id, name, count]) => ({ id, name, count })),
  total: menus.reduce((s, [, , c]) => s + c, 0),
});

describe("menu numbers", () => {
  it("diff lists changed, new and dropped menus (missing counts as 0)", () => {
    const prev = numbers([["a", "Месо", 10], ["b", "Посно", 4], ["c", "Детско", 2]]);
    const next = numbers([["a", "Месо", 12], ["b", "Посно", 4], ["d", "Сопствено", 3]]);
    expect(diffMenuNumbers(prev, next)).toEqual([
      { name: "Месо", from: 10, to: 12 },
      { name: "Сопствено", from: 0, to: 3 },
      { name: "Детско", from: 2, to: 0 },
    ]);
    expect(diffMenuNumbers(prev, prev)).toEqual([]);
  });

  it("differ compares menu set and counts, not names", () => {
    const a = numbers([["a", "Месо", 10]]);
    expect(menuNumbersDiffer(a, numbers([["a", "Друго име", 10]]))).toBe(false);
    expect(menuNumbersDiffer(a, numbers([["a", "Месо", 11]]))).toBe(true);
    expect(menuNumbersDiffer(a, numbers([["a", "Месо", 10], ["b", "Посно", 0]]))).toBe(true);
  });

  it("rebuilds a stored submission, menus ordered by title then id", () => {
    const sub = toMenuSubmission({
      id: "s1",
      sent_at: "2026-10-30T10:00:00Z",
      sent_by: "Ана",
      counts: { z: 2, y: 5, x: 1 },
      menu_titles: { z: "Посно", y: "Месо", x: "Месо" },
      total: 8,
      seen_at: null,
      seen_by: null,
      source: "couple",
      unanswered: null,
      allergy_summary: null,
      allergy_notes: null,
    });
    expect(sub.numbers.menus.map((m) => m.id)).toEqual(["x", "y", "z"]);
    expect(sub.numbers.total).toBe(8);
    expect(hasUnseenMenuNumbers({ latest: sub })).toBe(true);
    expect(hasUnseenMenuNumbers({ latest: { ...sub, seenAt: "2026-10-30T11:00:00Z" } })).toBe(false);
    expect(hasUnseenMenuNumbers({ latest: null })).toBe(false);
    expect(
      toMenuSubmission({
        id: "s2",
        sent_at: "",
        sent_by: "",
        total: 0,
        seen_at: null,
        seen_by: null,
        source: "couple" as const,
        unanswered: null,
        counts: null,
        menu_titles: null,
        allergy_summary: null,
        allergy_notes: null,
      }).numbers.menus,
    ).toEqual([]);
  });

  it("carries the couple's allergy summary, or the raw per-guest notes when there is no summary", () => {
    const withSummary = toMenuSubmission({
      id: "s1", sent_at: "2026-10-30T10:00:00Z", sent_by: "Младенците", counts: { a: 3 }, menu_titles: { a: "Класично" }, total: 3,
      seen_at: null, seen_by: null, source: "couple", unanswered: null,
      allergy_summary: "3 класично без кашкавал", allergy_notes: null,
    });
    expect(withSummary.allergySummary).toBe("3 класично без кашкавал");
    expect(withSummary.allergyNotes).toBeNull();

    const withRawNotes = toMenuSubmission({
      id: "s2", sent_at: "2026-10-30T10:00:00Z", sent_by: "Автоматски", counts: { a: 3 }, menu_titles: { a: "Класично" }, total: 3,
      seen_at: null, seen_by: null, source: "auto", unanswered: 0,
      allergy_summary: null,
      allergy_notes: [{ menuId: "a", menuName: "Класично", notes: [{ guestId: "g1", guestName: "Ана", text: "без кашкавал" }] }],
    });
    expect(withRawNotes.allergySummary).toBeNull();
    expect(withRawNotes.allergyNotes).toEqual([{ menuId: "a", menuName: "Класично", notes: [{ guestId: "g1", guestName: "Ана", text: "без кашкавал" }] }]);
  });
});
