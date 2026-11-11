import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
// Re-exported as a type only (erased at compile time), so importing it from
// this server-only file stays safe for client components — see categories.ts.
export type { VendorPartnerCategory } from "./categories";
import type { VendorPartnerCategory } from "./categories";

export interface VendorPartner {
  id: string;
  category: VendorPartnerCategory;
  name: string;
  city: string;
  short_description: string;
  full_description: string | null;
  cover_photo_path: string | null;
  gallery_photo_paths: string[];
  phone: string | null;
  viber_phone: string | null;
  whatsapp_phone: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  is_featured: boolean;
}

const VENDOR_PARTNER_COLUMNS =
  "id, category, name, city, short_description, full_description, cover_photo_path, gallery_photo_paths, phone, viber_phone, whatsapp_phone, website_url, instagram_url, facebook_url, is_featured";

// getVendorPartnerPhotoUrl lives in ./photo-url.ts, NOT here, and is never
// re-exported from this file: this file is "server-only" (above), so
// re-exporting it here would poison it back onto the server-only side for
// anything that imports it from here. Client components must import it from
// ./photo-url directly — see PartnerCard.tsx / PartnerDetailModal.tsx.

/** Every read for the landing page, the couple dashboard, and the admin
 * screen goes through this one function — there is no second listing path. */
export async function listVendorPartners(): Promise<VendorPartner[]> {
  const { data, error } = await createServiceRoleClient()
    .from("vendor_partners")
    .select(VENDOR_PARTNER_COLUMNS)
    .order("is_featured", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []) as VendorPartner[];
}

export async function getVendorPartner(id: string): Promise<VendorPartner | null> {
  const { data, error } = await createServiceRoleClient()
    .from("vendor_partners")
    .select(VENDOR_PARTNER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as VendorPartner | null;
}
