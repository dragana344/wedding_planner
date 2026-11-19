import { describe, it, expect } from "vitest";
import { priceComparison, totalMatchesPerGuest } from "@/lib/venue/price";

describe("priceComparison (decision 11)", () => {
  it("contracted vs final meals, with the difference", () => {
    expect(priceComparison({ perGuest: 1500, contractedGuests: 200, finalMeals: 214 })).toBe(
      "Договорено: 200 × 1.500 ден = 300.000 ден · Конечно: 214 оброци → 321.000 ден (+21.000)",
    );
    expect(priceComparison({ perGuest: 1500, contractedGuests: 200, finalMeals: 190 })).toBe(
      "Договорено: 200 × 1.500 ден = 300.000 ден · Конечно: 190 оброци → 285.000 ден (−15.000)",
    );
    expect(priceComparison({ perGuest: 1500, contractedGuests: 200, finalMeals: 200 })).toBe(
      "Договорено: 200 × 1.500 ден = 300.000 ден · Конечно: 200 оброци → 300.000 ден",
    );
  });

  it("marks the estimated meals and shows no-meal children apart, unpriced", () => {
    expect(priceComparison({ perGuest: 1500, contractedGuests: 200, finalMeals: 210, estimated: 10, noMeal: 4 })).toBe(
      "Договорено: 200 × 1.500 ден = 300.000 ден · Конечно: 210 оброци (од кои проценка: 10) → 315.000 ден (+15.000) · Деца без оброк: 4 (не се наплаќаат)",
    );
  });

  it("only the contracted part without a final count; nothing for a hand-typed total", () => {
    expect(priceComparison({ perGuest: 1000, contractedGuests: 50, finalMeals: null })).toBe("Договорено: 50 × 1.000 ден = 50.000 ден");
    expect(priceComparison({ perGuest: null, contractedGuests: null, finalMeals: 120 })).toBeNull();
  });

  it("the per-guest price is kept only while the total still matches it", () => {
    expect(totalMatchesPerGuest(300000, 1500, 200)).toBe(true);
    expect(totalMatchesPerGuest(310000, 1500, 200)).toBe(false);
    expect(totalMatchesPerGuest(null, 1500, 200)).toBe(false);
    expect(totalMatchesPerGuest(2501.5, 2501.5, 1)).toBe(true);
  });
});
