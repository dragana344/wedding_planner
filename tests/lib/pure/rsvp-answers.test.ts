import { describe, it, expect } from "vitest";
import { decideSharedMatch, nameFitsGuest, normalizePhone, suggestGuests } from "@/lib/couple/rsvp-match";
import {
  CHILDREN_OVER_PARTY_ERROR,
  checkPartyNumbers,
  cleanHouseholdNames,
  describeChanges,
  overInvited,
  overInvitedLabel,
  type AnswerSnapshot,
} from "@/lib/couple/rsvp-answer-view";

// Group B task 1 (0179): the shared link's matching and the couple's view of answers.

describe("normalizePhone", () => {
  it("reads the usual ways of typing a Macedonian number as the same digits", () => {
    for (const typed of ["070 123 456", "+389 70 123 456", "00389 70/123-456", "070-123-456", "70123456", "(070) 123456"]) {
      expect(normalizePhone(typed), typed).toBe("38970123456");
    }
  });
  it("keeps a foreign number with its own code, and refuses too-short or empty ones", () => {
    expect(normalizePhone("+49 151 2345678")).toBe("491512345678");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("decideSharedMatch (matching order)", () => {
  const guests = [
    { id: "ana", full_name: "Ана Петровска", phone: "070 111 222" },
    { id: "marko1", full_name: "Марко Илиевски", phone: null },
    { id: "marko2", full_name: "Марко Илиевски", phone: "071 999 888" },
    { id: "jana", full_name: "Јана Јанева", phone: null },
  ];

  it("1. a remembered guest wins over everything typed", () => {
    expect(decideSharedMatch(guests, { fullName: "Некој Друг", phone: "070 111 222", rememberedGuestId: "jana" })).toEqual({
      kind: "apply", guestId: "jana", match: "remembered",
    });
  });

  it("…but a remembered guest that was deleted falls back to the other rules", () => {
    expect(decideSharedMatch(guests, { fullName: "Ана Петровска", rememberedGuestId: "gone" })).toEqual({ kind: "apply", guestId: "ana", match: "exact" });
  });

  it("2. one guest with the typed phone, when the name fits that guest at least loosely", () => {
    expect(decideSharedMatch(guests, { fullName: "Ana Petrovska", phone: "+389 70 111 222" })).toEqual({ kind: "apply", guestId: "ana", match: "phone" });
    // Part of the name, in any order or script, still fits.
    expect(decideSharedMatch(guests, { fullName: "Ана", phone: "070111222" })).toEqual({ kind: "apply", guestId: "ana", match: "phone" });
    expect(decideSharedMatch(guests, { fullName: "Petrovska Ana", phone: "070111222" })).toEqual({ kind: "apply", guestId: "ana", match: "phone" });
    // The phone tells two namesakes apart.
    expect(decideSharedMatch(guests, { fullName: "Марко Илиевски", phone: "071 999 888" })).toEqual({ kind: "apply", guestId: "marko2", match: "phone" });
  });

  it("…a phone with a name that fits nobody is unsure: the phone alone never decides", () => {
    expect(decideSharedMatch(guests, { fullName: "Анче", phone: "070111222" })).toEqual({ kind: "review", candidateIds: ["ana"] });
    expect(decideSharedMatch(guests, { fullName: "Некој Друг", phone: "070 111 222" })).toEqual({ kind: "review", candidateIds: ["ana"] });
  });

  it("nameFitsGuest: every typed word is a word of the guest's name, across scripts", () => {
    expect(nameFitsGuest("ana", "Ана Петровска")).toBe(true);
    expect(nameFitsGuest("Ана Марија", "Ана Петровска")).toBe(false);
    expect(nameFitsGuest("  ", "Ана Петровска")).toBe(false);
  });

  it("…phone and name pointing at different guests is unsure", () => {
    expect(decideSharedMatch(guests, { fullName: "Јана Јанева", phone: "070 111 222" })).toEqual({ kind: "review", candidateIds: ["ana", "jana"] });
  });

  it("3. exactly one guest with the exact name (case and spaces ignored)", () => {
    expect(decideSharedMatch(guests, { fullName: "  јана   ЈАНЕВА " })).toEqual({ kind: "apply", guestId: "jana", match: "exact" });
    // An unknown phone does not stop a sure name match.
    expect(decideSharedMatch(guests, { fullName: "Јана Јанева", phone: "075 000 000" })).toEqual({ kind: "apply", guestId: "jana", match: "exact" });
  });

  it("4. nobody even loosely named so: a new guest", () => {
    expect(decideSharedMatch(guests, { fullName: "Петар Петровски" })).toEqual({ kind: "new" });
    expect(decideSharedMatch([], { fullName: "Петар Петровски", phone: "070 111 222" })).toEqual({ kind: "new" });
  });

  it("5. several exact namesakes, or only a cross-script/loose match, goes to the couple", () => {
    expect(decideSharedMatch(guests, { fullName: "Марко Илиевски" })).toEqual({ kind: "review", candidateIds: ["marko1", "marko2"] });
    expect(decideSharedMatch(guests, { fullName: "Ana Petrovska" })).toEqual({ kind: "review", candidateIds: ["ana"] });
    expect(decideSharedMatch(guests, { fullName: "Jana Janeva" })).toEqual({ kind: "review", candidateIds: ["jana"] });
  });

  it("a shared family phone (two guests) falls through to the name", () => {
    const family = [
      { id: "a", full_name: "Ана Ристова", phone: "070 555 555" },
      { id: "b", full_name: "Борис Ристов", phone: "070 555 555" },
    ];
    expect(decideSharedMatch(family, { fullName: "Борис Ристов", phone: "070 555 555" })).toEqual({ kind: "apply", guestId: "b", match: "exact" });
  });
});

describe("suggestGuests (the couple's 'Ова е …' list)", () => {
  const guests = [
    { id: "1", full_name: "Ана Петровска", phone: null },
    { id: "2", full_name: "Марко Петровски", phone: null },
    { id: "3", full_name: "Јана Илиева", phone: "070 111 222" },
    { id: "4", full_name: "Ана Петровска", phone: null },
  ];
  it("puts the phone match first, then exact, loose and surname matches; nobody unrelated", () => {
    expect(suggestGuests(guests, "Ana Petrovska", "070 111 222").map((g) => g.id)).toEqual(["3", "1", "4"]);
    expect(suggestGuests(guests, "Петровски Марко", null).map((g) => g.id)).toEqual(["2"]);
    expect(suggestGuests(guests, "Непознат", null)).toEqual([]);
  });
});

describe("answer numbers and household names", () => {
  it("children never more than the party", () => {
    expect(checkPartyNumbers(3, 3)).toBeNull();
    expect(checkPartyNumbers(2, 3)).toBe(CHILDREN_OVER_PARTY_ERROR);
  });
  it("household names: trimmed, blanks dropped, capped", () => {
    expect(cleanHouseholdNames(["  Ана  Петровска ", "", null, "Марко"])).toEqual(["Ана Петровска", "Марко"]);
    expect(cleanHouseholdNames(Array(150).fill("x"))).toHaveLength(100);
    expect(cleanHouseholdNames(undefined)).toEqual([]);
  });
  it("over the invited number only for a yes with a number set", () => {
    expect(overInvited("confirmed", 4, 2)).toBe(2);
    expect(overInvitedLabel(2)).toBe("+2 над поканетите");
    expect(overInvited("confirmed", 2, 2)).toBe(0);
    expect(overInvited("declined", 4, 2)).toBe(0);
    expect(overInvited("confirmed", 4, null)).toBe(0);
    expect(overInvitedLabel(0)).toBe("");
  });
});

describe("describeChanges (before → after)", () => {
  const menus = [
    { id: "m", name: "Месо" },
    { id: "p", name: "Посно" },
  ];
  const before: AnswerSnapshot = { status: "confirmed", party_size: 2, children_count: 0, menu_counts: { m: 2 }, allergies: null, household_names: [] };

  it("lists only what changed", () => {
    const after = { ...before, party_size: 4, children_count: 1, menu_counts: { m: 3, p: 1 }, allergies: "ореви", household_names: ["Ана"] };
    expect(describeChanges(before, after, menus)).toEqual(["2 → 4 лица", "Деца: 0 → 1", "Мени: Месо 2 → Месо 3, Посно 1", "Алергии: — → ореви", "Со: Ана"]);
    expect(describeChanges(before, before, menus)).toEqual([]);
  });
  it("a status change, and a first answer that lists what it set", () => {
    expect(describeChanges(before, { ...before, status: "declined", menu_counts: {} }, menus)).toEqual(["Потврден → Одбиен", "Мени: Месо 2 → —"]);
    expect(describeChanges(null, before, menus)).toEqual(["Потврден", "2 лица", "Мени: Месо 2"]);
    expect(describeChanges(null, null)).toEqual([]);
  });
  it("0181: the children without a meal, and older answers without the number", () => {
    const after = { ...before, party_size: 3, children_count: 1, no_meal_count: 1 };
    expect(describeChanges(before, after, menus)).toEqual(["2 → 3 лица", "Деца: 0 → 1", "Деца без оброк: 0 → 1"]);
    expect(describeChanges(null, after, menus)).toContain("Деца без оброк: 1");
    // A "no" keeps the choice (0181): only the status line.
    expect(describeChanges(before, { ...before, status: "declined" }, menus)).toEqual(["Потврден → Одбиен"]);
  });
});
