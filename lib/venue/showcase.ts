import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";

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
    .order("created_at")
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  return checkListBound(data, "event_showcase_photos");
}

// Adding and removing photos is a manager action (0107): it runs in
// /api/venue/events/[eventId]/showcase with a service-role client, so each
// write below is scoped to the event explicitly.

/** Records an uploaded (already confirmed) photo for the event. */
export async function addShowcasePhoto(
  eventId: string,
  photoPath: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<ShowcasePhoto> {
  const { data, error } = await client
    .from("event_showcase_photos")
    .insert({ event_id: eventId, photo_path: photoPath })
    .select("id, event_id, photo_path")
    .single();
  if (error) throw error;
  return data;
}

/** Removes one of the event's photos; its file is queued for deletion (0038). False when no such photo. */
export async function deleteShowcasePhoto(
  eventId: string,
  photoId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<boolean> {
  const { data, error } = await client
    .from("event_showcase_photos")
    .delete()
    .eq("id", photoId)
    .eq("event_id", eventId)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
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
