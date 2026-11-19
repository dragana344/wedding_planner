import { describe, it, expect } from "vitest";
import { guestMenuMeals, isGuestDone, menuSplitFits, menusChangedText, validateMenuCounts } from "@/lib/couple/guest-menus";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("validateMenuCounts", () => {
  it("sum must equal party size", () => {
    expect(validateMenuCounts([A, B], 4, { [A]: 3, [B]: 1 })).toEqual({ ok: true, counts: { [A]: 3, [B]: 1 } });
    expect(validateMenuCounts([A, B], 4, { [A]: 2, [B]: 1 })).toEqual({ ok: false, error: "Изберете мени за сите 4 лица." });
    expect(validateMenuCounts([A, B], 2, { [A]: 2, [B]: 1 })).toEqual({ ok: false, error: "Изберете мени за сите 2 лица." });
  });

  it("unknown menu refused", () => {
    expect(validateMenuCounts([A, B], 2, { [A]: 1, "33333333-3333-4333-8333-333333333333": 1 })).toEqual({
      ok: false,
      error: "Непознато мени.",
    });
  });

  it("single menu needs no counts", () => {
    expect(validateMenuCounts([A], 3, {})).toEqual({ ok: true, counts: {} });
    expect(validateMenuCounts([], 3, { [A]: 3 })).toEqual({ ok: true, counts: {} });
  });

  it("drops zero entries", () => {
    expect(validateMenuCounts([A, B], 2, { [A]: 2, [B]: 0 })).toEqual({ ok: true, counts: { [A]: 2 } });
  });
});

describe("isGuestDone", () => {
  const confirmed = (party_size: number, menu_counts: Record<string, number>) => ({ rsvp_status: "confirmed", party_size, menu_counts });

  it("declined guests are done", () => {
    expect(isGuestDone({ rsvp_status: "declined", party_size: 2, menu_counts: {} }, [A, B])).toBe(true);
  });
  it("undecided guests are not done", () => {
    for (const s of ["invited", "pending", "later"]) expect(isGuestDone({ rsvp_status: s, party_size: 1, menu_counts: {} }, [A])).toBe(false);
  });
  it("confirmed needs no counts with 0 or 1 menus", () => {
    expect(isGuestDone(confirmed(2, {}), [])).toBe(true);
    expect(isGuestDone(confirmed(2, {}), [A])).toBe(true);
  });
  it("confirmed with 2+ menus needs counts summing to the party", () => {
    expect(isGuestDone(confirmed(4, { [A]: 3, [B]: 1 }), [A, B])).toBe(true);
    expect(isGuestDone(confirmed(4, { [A]: 3 }), [A, B])).toBe(false);
    expect(isGuestDone(confirmed(4, { [A]: 3, [B]: 1 }), [A, "other"])).toBe(false);
  });
});

describe("0181: children without a meal, kept choices", () => {
  it("the no-meal children complete the split", () => {
    expect(validateMenuCounts([A, B], 4, { [A]: 2, [B]: 1 }, 1)).toEqual({ ok: true, counts: { [A]: 2, [B]: 1 } });
    expect(validateMenuCounts([A, B], 4, { [A]: 2, [B]: 2 }, 1)).toEqual({ ok: false, error: "Изберете мени за сите 3 лица." });
  });

  it("a declined or 'later' guest's kept split is not done, but fits again once they confirm with the same party", () => {
    const kept = { party_size: 3, menu_counts: { [A]: 2 }, no_meal_count: 1 };
    expect(isGuestDone({ ...kept, rsvp_status: "later" }, [A, B])).toBe(false);
    expect(isGuestDone({ ...kept, rsvp_status: "declined" }, [A, B])).toBe(true);
    expect(menuSplitFits(kept, [A, B])).toBe(true);
    expect(isGuestDone({ ...kept, rsvp_status: "confirmed" }, [A, B])).toBe(true);
    // A smaller party, or a menu taken off the event: they choose again.
    expect(isGuestDone({ ...kept, party_size: 2, rsvp_status: "confirmed" }, [A, B])).toBe(false);
    expect(isGuestDone({ ...kept, rsvp_status: "confirmed" }, [B, "other"])).toBe(false);
  });

  it("meals per menu: only confirmed guests, a single menu feeds the party but the no-meal children", () => {
    const g = { rsvp_status: "confirmed", party_size: 4, menu_counts: { [A]: 1, [B]: 2 }, no_meal_count: 1 };
    expect(guestMenuMeals(g, A, [A, B])).toBe(1);
    expect(guestMenuMeals(g, B, [A, B])).toBe(2);
    expect(guestMenuMeals({ ...g, menu_counts: {} }, A, [A])).toBe(3);
    expect(guestMenuMeals({ ...g, rsvp_status: "declined" }, B, [A, B])).toBe(0);
  });

  it("words the warning after the venue changed the menus", () => {
    expect(menusChangedText(1)).toBe("Менијата се променети — 1 гостин треба повторно да избере мени");
    expect(menusChangedText(3)).toBe("Менијата се променети — 3 гости треба повторно да изберат мени");
  });
});
