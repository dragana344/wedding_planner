import { describe, it, expect } from "vitest";
import {
  diffMenuNumbers,
  estimateNote,
  hasUnseenMenuNumbers,
  menuNumbersDiffer,
  prefillEstimate,
  sentHeadcount,
  sentMeals,
  sentMenus,
  toMenuSubmission,
  sentNumbers,
  withRemainingEstimate,
} from "@/lib/menu-numbers";

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

  it("0181: the children without a meal are a line of their own, compared and diffed like a menu", () => {
    const a = { menus: [{ id: "a", name: "Класично", count: 3 }], total: 3, noMeal: 1 };
    const b = { menus: [{ id: "a", name: "Класично", count: 3 }], total: 3, noMeal: 2 };
    expect(menuNumbersDiffer(a, b)).toBe(true);
    expect(menuNumbersDiffer(a, { ...a, noMeal: 1 })).toBe(false);
    // An older sending without the number reads as 0.
    expect(menuNumbersDiffer({ menus: a.menus, total: 3 }, { ...a, noMeal: 0 })).toBe(false);
    expect(diffMenuNumbers(a, b)).toEqual([{ name: "Деца без оброк", from: 1, to: 2 }]);
    const row = toMenuSubmission({
      id: "s1", sent_at: "2026-10-30T10:00:00Z", sent_by: "Младенците", counts: { a: 3 }, menu_titles: { a: "Класично" }, total: 3,
      seen_at: null, seen_by: null, source: "couple", unanswered: null, allergy_summary: null, allergy_notes: null, no_meal_count: 2,
    });
    expect(row.numbers.noMeal).toBe(2);
  });
});

describe("0182: the estimate", () => {
  it("prefill splits the unanswered people like the real counts, adding up exactly", () => {
    expect(prefillEstimate([{ id: "a", count: 3 }, { id: "b", count: 1 }], 8)).toEqual({ a: 6, b: 2 });
    expect(prefillEstimate([{ id: "a", count: 1 }, { id: "b", count: 1 }, { id: "c", count: 1 }], 10)).toEqual({ a: 4, b: 3, c: 3 });
    expect(prefillEstimate([{ id: "a", count: 2 }, { id: "b", count: 1 }], 5)).toEqual({ a: 3, b: 2 });
  });

  it("prefill: nothing counted yet splits evenly; no people or no menus give zeros / nothing", () => {
    expect(prefillEstimate([{ id: "a", count: 0 }, { id: "b", count: 0 }], 5)).toEqual({ a: 3, b: 2 });
    expect(prefillEstimate([{ id: "a", count: 4 }], 0)).toEqual({ a: 0 });
    expect(prefillEstimate([], 7)).toEqual({});
  });

  it("toMenuSubmission builds the estimate apart from the real counts (null when there is none)", () => {
    const base = {
      id: "s", sent_at: "2030-01-01T00:00:00Z", sent_by: "Младенците", counts: { a: 10, b: 2 }, menu_titles: { a: "Месо", b: "Посно", c: "Риба" },
      total: 12, seen_at: null, seen_by: null, source: "couple" as const, unanswered: 3, allergy_summary: null, allergy_notes: null, no_meal_count: 1,
    };
    const sub = toMenuSubmission({ ...base, estimated_counts: { a: 4, b: 0, c: 1 }, estimated_total: 5 });
    expect(sub.estimate).toEqual({ menus: [{ id: "a", name: "Месо", count: 4 }, { id: "c", name: "Риба", count: 1 }], total: 5 });
    expect(sentMenus(sub)).toEqual([
      { id: "a", name: "Месо", count: 14, estimated: 4 },
      { id: "b", name: "Посно", count: 2, estimated: 0 },
      { id: "c", name: "Риба", count: 1, estimated: 1 },
    ]);
    expect(sentMeals(sub)).toBe(17);
    expect(sentHeadcount(sub)).toBe(18);
    expect(toMenuSubmission({ ...base, estimated_counts: null, estimated_total: 0 }).estimate).toBeNull();
    expect(toMenuSubmission(base).estimate).toBeNull();
  });

  it("marks the estimated part the same way everywhere", () => {
    expect(estimateNote(24)).toBe("од кои проценка: 24");
  });
});

describe("withRemainingEstimate (0184)", () => {
  const latest = {
    numbers: { menus: [{ id: "a", name: "Месо", count: 10 }, { id: "b", name: "Посно", count: 2 }], total: 12, noMeal: 0 },
    estimate: { menus: [{ id: "a", name: "Месо", count: 3 }, { id: "b", name: "Посно", count: 1 }], total: 4 },
    estimatedPeople: 4,
  };
  it("a sending's numbers include its estimate", () => {
    expect(sentNumbers(latest)).toEqual({ menus: [{ id: "a", name: "Месо", count: 13 }, { id: "b", name: "Посно", count: 3 }], total: 16, noMeal: 0 });
  });
  it("shrinks the estimate as the people it stood for answer, never above what was sent", () => {
    const now = { menus: [{ id: "a", name: "Месо", count: 12 }, { id: "b", name: "Посно", count: 2 }], total: 14, noMeal: 0 };
    // 2 of 4 left: split 3:1 like the sent estimate (a tie goes to the earlier menu).
    expect(withRemainingEstimate(now, latest, 2)).toEqual({ menus: [{ id: "a", name: "Месо", count: 14 }, { id: "b", name: "Посно", count: 2 }], total: 16, noMeal: 0 });
    expect(withRemainingEstimate(now, latest, 0).total).toBe(14);
    // More unanswered people than at sending (new guests added): capped at what was sent.
    expect(withRemainingEstimate(now, latest, 9).total).toBe(18);
  });
  it("is just the current numbers without an estimate", () => {
    const now = { menus: [{ id: "a", name: "Месо", count: 1 }], total: 1 };
    expect(withRemainingEstimate(now, { estimate: null }, 5)).toBe(now);
  });
});
