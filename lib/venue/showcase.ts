import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";

export interface ShowcasePhoto {
  id: string;
  event_id: string;
  photo_path: string;
}

const SHOWCASE_PHOTOS_BUCKET = "event-showcase-photos";

export function getShowcasePhotoUrl(photoPath: string): string {
  const { data } = resolveSupabaseClient()
    .storage.from(SHOWCASE_PHOTOS_BUCKET)
    .getPublicUrl(photoPath);
  return data.publicUrl;
}

export async function listShowcasePhotos(eventId: string): Promise<ShowcasePhoto[]> {
  const { data, error } = await resolveSupabaseClient()
    .from("event_showcase_photos")
    .select("id, event_id, photo_path")
    .eq("event_id", eventId)
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function addShowcasePhoto(
  venueId: string,
  eventId: string,
  file: File
): Promise<ShowcasePhoto> {
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${venueId}/${eventId}-${Date.now()}.${extension}`;
  const supabase = resolveSupabaseClient();

  const { error: uploadError } = await supabase.storage
    .from(SHOWCASE_PHOTOS_BUCKET)
    .upload(path, file);
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("event_showcase_photos")
    .insert({ event_id: eventId, photo_path: path })
    .select("id, event_id, photo_path")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteShowcasePhoto(photoId: string): Promise<void> {
  const { error } = await resolveSupabaseClient()
    .from("event_showcase_photos")
    .delete()
    .eq("id", photoId);
  if (error) throw error;
}

export async function countPastEvents(
  venueId: string,
  today: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<number> {
  const { count, error } = await client
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId)
    .lt("event_date", today);
  if (error) throw error;
  return count ?? 0;
}
