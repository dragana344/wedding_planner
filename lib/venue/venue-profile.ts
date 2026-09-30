import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";
import { IMAGE_SNIFF_BYTES, sniffImageType } from "@/lib/image-type";

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

export async function updateVenueProfile(venueId: string, input: { address: string | null; phone: string | null }): Promise<void> {
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
  const { error } = await client.from("venues").update({ logo_path: path }).eq("id", venueId);
  if (error) throw error;
  return venueLogoUrl(client, path)!;
}

export async function removeVenueLogo(venueId: string): Promise<void> {
  const { error } = await resolveSupabaseClient().from("venues").update({ logo_path: null }).eq("id", venueId);
  if (error) throw error;
}
