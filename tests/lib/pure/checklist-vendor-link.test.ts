import { describe, it, expect } from "vitest";
import { checklistItemVendorCategory } from "@/lib/couple/checklist-vendor-link";

describe("checklistItemVendorCategory", () => {
  it("matches a seeded starter title to its vendor category", () => {
    expect(checklistItemVendorCategory("Резервирај фотограф")).toBe("photography");
    expect(checklistItemVendorCategory("Потврди избор на мени")).toBe("catering");
  });

  it("matches regardless of case and surrounding words", () => {
    expect(checklistItemVendorCategory("нарачај ЦВЕЌЕ за црквата")).toBe("florist");
    expect(checklistItemVendorCategory("договори музика за прославата")).toBe("music");
  });

  it("returns null for a title with no matching keyword", () => {
    expect(checklistItemVendorCategory("Испрати покани")).toBeNull();
    expect(checklistItemVendorCategory("Финализирај список на гости")).toBeNull();
  });
});
