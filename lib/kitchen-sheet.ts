// The venue's printable kitchen sheet (decision 10), pure parts: allergy
// notes grouped by table. The notes are only those the couple's latest
// sending already carried to the venue (0131) — the sheet regroups them by
// where the guests sit, it never reads more.

import type { AllergyNoteGroup } from "./menu-numbers";

export type KitchenAllergy = { guestName: string; menuName: string; text: string };
export type KitchenAllergyTable = { table: string; notes: KitchenAllergy[] };

/**
 * Notes grouped under each table the guest sits at (a party split across two
 * tables shows at both), tables in `tableOrder`; guests with no seat go to
 * `unseated`. Names within a table sorted ("mk").
 */
export function allergiesByTable(
  groups: readonly AllergyNoteGroup[],
  tablesOf: ReadonlyMap<string, readonly string[]>,
  tableOrder: readonly string[],
): { tables: KitchenAllergyTable[]; unseated: KitchenAllergy[] } {
  const byTable = new Map<string, KitchenAllergy[]>();
  const unseated: KitchenAllergy[] = [];
  for (const g of groups) {
    for (const n of g.notes) {
      const note = { guestName: n.guestName, menuName: g.menuName, text: n.text };
      const tables = tablesOf.get(n.guestId) ?? [];
      if (tables.length === 0) unseated.push(note);
      for (const t of tables) byTable.set(t, [...(byTable.get(t) ?? []), note]);
    }
  }
  const byName = (a: KitchenAllergy, b: KitchenAllergy) => a.guestName.localeCompare(b.guestName, "mk") || a.menuName.localeCompare(b.menuName, "mk");
  const order = [...tableOrder, ...[...byTable.keys()].filter((t) => !tableOrder.includes(t))];
  return {
    tables: order.filter((t) => byTable.has(t)).map((table) => ({ table, notes: byTable.get(table)!.sort(byName) })),
    unseated: unseated.sort(byName),
  };
}
