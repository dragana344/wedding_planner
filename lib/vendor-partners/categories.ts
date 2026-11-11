// Plain data, deliberately NOT "server-only" — the category list and type are
// shared by the service-role data layer (lib/vendor-partners/partners.ts),
// the admin write layer (lib/admin/vendor-partners-actions-core.ts), and the
// client-side admin form (components/admin/VendorPartnersClient.tsx), which
// must be able to import the list without pulling in any server-only code.

export const VENDOR_PARTNER_CATEGORIES = [
  "music",
  "decoration",
  "catering",
  "florist",
  "jeweler",
  "equipment",
  "photography",
  "cakes_desserts",
  "makeup_hair",
] as const;

export type VendorPartnerCategory = (typeof VENDOR_PARTNER_CATEGORIES)[number];
