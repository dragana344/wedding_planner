import { describe, it, expect } from "vitest";
import { allergiesByTable } from "@/lib/kitchen-sheet";
import type { AllergyNoteGroup } from "@/lib/menu-numbers";

const groups: AllergyNoteGroup[] = [
  { menuId: "a", menuName: "Месо", notes: [{ guestId: "g1", guestName: "Ана", text: "ореви" }, { guestId: "g2", guestName: "Бојан", text: "млеко" }] },
  { menuId: "b", menuName: "Посно", notes: [{ guestId: "g3", guestName: "Вера", text: "глутен" }, { guestId: "g1", guestName: "Ана", text: "ореви" }] },
];

describe("allergiesByTable", () => {
  it("groups by the tables the guests sit at, in plan order; the unseated apart", () => {
    const seats = new Map([
      ["g1", ["Маса 2"]],
      ["g3", ["Маса 1", "Маса 2"]],
    ]);
    const out = allergiesByTable(groups, seats, ["Маса 1", "Маса 2", "Маса 3"]);
    expect(out.tables).toEqual([
      { table: "Маса 1", notes: [{ guestName: "Вера", menuName: "Посно", text: "глутен" }] },
      {
        table: "Маса 2",
        notes: [
          { guestName: "Ана", menuName: "Месо", text: "ореви" },
          { guestName: "Ана", menuName: "Посно", text: "ореви" },
          { guestName: "Вера", menuName: "Посно", text: "глутен" },
        ],
      },
    ]);
    expect(out.unseated).toEqual([{ guestName: "Бојан", menuName: "Месо", text: "млеко" }]);
  });

  it("no notes, nothing to show", () => {
    expect(allergiesByTable([], new Map(), ["Маса 1"])).toEqual({ tables: [], unseated: [] });
  });
});
