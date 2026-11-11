// Links a checklist task to the vendor marketplace (lib/vendor-partners), by
// keyword on its free-text title — checklist items have no category column,
// only a title the couple typed or one of the seeded starter titles.
import type { VendorPartnerCategory } from "@/lib/vendor-partners/categories";

const KEYWORD_CATEGORIES: readonly [string, VendorPartnerCategory][] = [
  ["фотограф", "photography"],
  ["музик", "music"],
  ["бенд", "music"],
  ["дј", "music"],
  ["декор", "decoration"],
  ["украс", "decoration"],
  ["цвеќ", "florist"],
  ["прстен", "jeweler"],
  ["бижут", "jeweler"],
  ["златар", "jeweler"],
  ["опрема", "equipment"],
  ["шатор", "equipment"],
  ["торта", "cakes_desserts"],
  ["десерт", "cakes_desserts"],
  ["колач", "cakes_desserts"],
  ["шминк", "makeup_hair"],
  ["фризур", "makeup_hair"],
  ["мени", "catering"],
  ["кетеринг", "catering"],
  ["храна", "catering"],
];

/** The vendor category a checklist task's title points to, by keyword; null for no match. */
export function checklistItemVendorCategory(title: string): VendorPartnerCategory | null {
  const lower = title.toLowerCase();
  for (const [keyword, category] of KEYWORD_CATEGORIES) {
    if (lower.includes(keyword)) return category;
  }
  return null;
}
