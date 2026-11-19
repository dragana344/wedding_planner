// Contracted vs final price (decision 11, 0182): when the venue priced the
// event per guest, the agreed total is guests × price, and the final one is
// the same price × the meals in the latest menu numbers (or the confirmed
// guests' meals while none were sent); children eating no meal are not
// priced. Pure; client-safe.

import { formatDen } from "@/lib/money";
import { estimateNote, NO_MEAL_LABEL } from "@/lib/menu-numbers";

/** "1.500" — whole numbers grouped like formatDen, without the unit. */
function grouped(n: number): string {
  return formatDen(n).replace(/ ден$/, "");
}

/**
 * "Договорено: 200 × 1.500 ден = 300.000 ден · Конечно: 210 оброци (од кои
 * проценка: 10) → 315.000 ден (+15.000) · Деца без оброк: 4 (не се наплаќаат)".
 * The final price is the meals × the per-guest price: real plus estimated
 * meals, the estimated part marked; children eating no meal are shown apart
 * and not priced. Null when the event wasn't priced per guest. Without a
 * final count only the contracted part is returned.
 */
export function priceComparison(input: {
  perGuest: number | null | undefined;
  contractedGuests: number | null | undefined;
  /** Meals in the final count, the estimated ones included. */
  finalMeals: number | null | undefined;
  /** Of `finalMeals`, how many are an estimate. */
  estimated?: number;
  /** Children eating no meal (not priced). */
  noMeal?: number;
}): string | null {
  const { perGuest, contractedGuests, finalMeals } = input;
  if (perGuest === null || perGuest === undefined || contractedGuests === null || contractedGuests === undefined) return null;
  const contracted = perGuest * contractedGuests;
  const head = `Договорено: ${contractedGuests} × ${formatDen(perGuest)} = ${formatDen(contracted)}`;
  if (finalMeals === null || finalMeals === undefined) return head;
  const final = perGuest * finalMeals;
  const diff = Math.round(final - contracted);
  const delta = diff === 0 ? "" : ` (${diff > 0 ? "+" : "−"}${grouped(Math.abs(diff))})`;
  const estimated = input.estimated && input.estimated > 0 ? ` (${estimateNote(input.estimated)})` : "";
  const noMeal = input.noMeal && input.noMeal > 0 ? ` · ${NO_MEAL_LABEL}: ${input.noMeal} (не се наплаќаат)` : "";
  return `${head} · Конечно: ${finalMeals} ${finalMeals === 1 ? "оброк" : "оброци"}${estimated} → ${formatDen(final)}${delta}${noMeal}`;
}

/** Whether a typed total still matches the calculator's per-guest price (else the comparison is dropped). */
export function totalMatchesPerGuest(total: number | null, perGuest: number | null, guests: number | null): boolean {
  return total !== null && perGuest !== null && guests !== null && Math.round(perGuest * guests * 100) === Math.round(total * 100);
}
