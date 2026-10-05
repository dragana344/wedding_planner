import { describe, it, expect } from "vitest";
import { MAX_PRICING_FEATURES, pricingSchemas } from "@/lib/admin/pricing-actions-core";

const valid = { name: "Про", price: "3.500 ден", period: "/ месечно", features: ["Менија", "Покани"], isFeatured: true, isPublished: true, sortOrder: 20 };

describe("pricing card schemas (Ценовник)", () => {
  it("accepts a normal card and trims its text", () => {
    const parsed = pricingSchemas.create.parse({ ...valid, name: "  Про ", features: [" Менија ", "Покани"] });
    expect(parsed.name).toBe("Про");
    expect(parsed.features).toEqual(["Менија", "Покани"]);
  });

  it("drops blank checklist rows instead of rejecting them", () => {
    expect(pricingSchemas.create.parse({ ...valid, features: ["Менија", "", "   "] }).features).toEqual(["Менија"]);
  });

  it("turns an empty period into null", () => {
    expect(pricingSchemas.create.parse({ ...valid, period: "  " }).period).toBeNull();
    expect(pricingSchemas.create.parse({ ...valid, period: null }).period).toBeNull();
  });

  it("requires a name and a price", () => {
    expect(pricingSchemas.create.safeParse({ ...valid, name: " " }).success).toBe(false);
    expect(pricingSchemas.create.safeParse({ ...valid, price: "" }).success).toBe(false);
  });

  it("caps the checklist length and each item's length", () => {
    const tooMany = Array.from({ length: MAX_PRICING_FEATURES + 1 }, (_, i) => `Ставка ${i}`);
    expect(pricingSchemas.create.safeParse({ ...valid, features: tooMany }).success).toBe(false);
    expect(pricingSchemas.create.safeParse({ ...valid, features: ["а".repeat(121)] }).success).toBe(false);
  });

  it("needs a uuid to update or delete", () => {
    expect(pricingSchemas.update.safeParse({ ...valid, cardId: "nope" }).success).toBe(false);
    expect(pricingSchemas.id.safeParse({ cardId: "00000000-0000-4000-8000-000000000001" }).success).toBe(true);
  });
});
