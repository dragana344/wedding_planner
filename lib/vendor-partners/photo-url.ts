import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";

// Deliberately NOT "server-only": building a public-bucket URL is pure string
// construction (no DB query, no auth), so this must stay callable from the
// client components that render vendor photos (PartnerCard, PartnerDetailModal).
// The service-role-only reads (listVendorPartners, getVendorPartner) live in
// ./partners.ts instead, which IS server-only — keep them split.
const VENDOR_PARTNER_PHOTOS_BUCKET = "vendor-partner-photos";

export function getVendorPartnerPhotoUrl(path: string | null): string | null {
  if (!path) return null;
  const { data } = resolveSupabaseClient().storage.from(VENDOR_PARTNER_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
