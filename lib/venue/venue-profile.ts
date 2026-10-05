import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";
import { IMAGE_SNIFF_BYTES, sniffImageType } from "@/lib/image-type";
import { normalizeBrandColor } from "@/lib/venue/brand-palette";

export async function getVenueName(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<string> {
  const { data, error } = await client.from("venues").select("name").eq("id", venueId).single();
  if (error) throw error;
  return data.name;
}

export async function updateVenueName(venueId: string, name: string): Promise<void> {
  const { data, error } = await resolveSupabaseClient()
    .from("venues")
    .update({ name })
    .eq("id", venueId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Venue name was not updated. Please try again.");
  }
}

// ---------------------------------------------------------------------------
// Profile (0074): address, phone, logo. The logo sits in the public
// event-showcase-photos bucket under the venue's folder.

export interface VenueProfile {
  name: string;
  address: string | null;
  phone: string | null;
  logo_path: string | null;
}

export const LOGO_BUCKET = "event-showcase-photos";
export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
export const LOGO_TYPE_ERROR = "Дозволени се PNG, JPG, WEBP до 5 MB.";
const LOGO_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

export async function getVenueProfile(
  venueId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<VenueProfile> {
  const { data, error } = await client.from("venues").select("name, address, phone, logo_path").eq("id", venueId).single();
  if (error) throw error;
  return data as VenueProfile;
}

export function venueLogoUrl(client: SupabaseClient, logoPath: string | null): string | null {
  if (!logoPath) return null;
  return client.storage.from(LOGO_BUCKET).getPublicUrl(logoPath).data.publicUrl;
}

export const VENUE_PHONE_ERROR = "Внесете важечки телефонски број.";

/** Digits with the usual separators, e.g. "+389 70 123 456" or "(02) 3123-456". */
export function isPhoneNumber(value: string): boolean {
  return /^\+?[\d\s()\/-]{6,24}$/.test(value) && value.replace(/\D/g, "").length >= 6;
}

export async function updateVenueProfile(venueId: string, input: { address: string | null; phone: string | null }): Promise<void> {
  if (input.phone?.trim() && !isPhoneNumber(input.phone.trim())) throw new Error(VENUE_PHONE_ERROR);
  const { data, error } = await resolveSupabaseClient()
    .from("venues")
    .update({ address: input.address?.trim() || null, phone: input.phone?.trim() || null })
    .eq("id", venueId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Профилот не е зачуван. Обидете се повторно.");
}

function readHead(file: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file.slice(0, IMAGE_SNIFF_BYTES));
  });
}

/** The logo's file extension, judged by its bytes (not its name); throws the user-facing message otherwise. */
export async function checkLogoFile(file: File): Promise<string> {
  if (file.size > LOGO_MAX_BYTES) throw new Error(LOGO_TYPE_ERROR);
  const ext = sniffImageType(await readHead(file));
  if (!ext || !(ext in LOGO_TYPES)) throw new Error(LOGO_TYPE_ERROR);
  return ext;
}

/** Uploads a new logo, points the venue at it (the old one is queued for deletion by 0074) and returns its URL. */
export async function uploadVenueLogo(venueId: string, file: File): Promise<string> {
  const ext = await checkLogoFile(file);
  const client = resolveSupabaseClient();
  const path = `${venueId}/logo-${Date.now()}.${ext}`;
  const { error: uploadError } = await client.storage
    .from(LOGO_BUCKET)
    .upload(path, file, { contentType: LOGO_TYPES[ext], cacheControl: "31536000" });
  if (uploadError) throw uploadError;
  await setVenueLogoPath(venueId, path, client);
  return venueLogoUrl(client, path)!;
}

/** Points the venue at a logo (or none). Throws when no row changed — e.g. RLS refused — instead of reporting success. */
export async function setVenueLogoPath(
  venueId: string,
  logoPath: string | null,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  const { data, error } = await client.from("venues").update({ logo_path: logoPath }).eq("id", venueId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Логото не е зачувано. Обидете се повторно.");
}

export async function removeVenueLogo(venueId: string): Promise<void> {
  await setVenueLogoPath(venueId, null);
}

export const BRAND_COLOR_ERROR = "Изберете боја во облик #rrggbb.";

/**
 * Sets (or with null, clears) the venue's accent colour (0087). Stored
 * normalised; whether it is shown depends on the venue's plan
 * (`venue_branding`), which the pages check when they read it.
 */
export async function updateVenueBrandColor(venueId: string, color: string | null): Promise<void> {
  const value = color === null ? null : normalizeBrandColor(color);
  if (color !== null && value === null) throw new Error(BRAND_COLOR_ERROR);
  const { data, error } = await resolveSupabaseClient().from("venues").update({ brand_color: value }).eq("id", venueId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("Локалот не е пронајден.");
}

