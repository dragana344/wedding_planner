import "server-only";
import { randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { fitsQuota, storageLimitBytes, type StorageUsage } from "@/lib/media/limits";
import { getEventFeatures } from "@/lib/entitlements/server";

// The guests' album (Session 4, C1/C5): one public token per event for the
// QR page, and the album's storage quota.

export type PublicAlbum = { eventId: string; coupleNames: string; eventDate: string; venueName: string };

export const QUOTA_FULL_ERROR = "Просторот за овој албум е полн. Парот може да активира поголем пакет.";

/** The event's album token, created on first use (24 URL-safe characters). */
export async function getOrCreateAlbumToken(eventId: string): Promise<string> {
  const client = createServiceRoleClient();
  const { data: existing, error } = await client.from("event_albums").select("public_token").eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  if (existing) return existing.public_token;

  const token = randomBytes(18).toString("base64url");
  const { error: insertError } = await client.from("event_albums").insert({ event_id: eventId, public_token: token });
  if (insertError) {
    // Two tabs created it at once: the other insert won, use its token.
    const { data: winner } = await client.from("event_albums").select("public_token").eq("event_id", eventId).maybeSingle();
    if (winner) return winner.public_token;
    throw insertError;
  }
  return token;
}

/** The album behind a guest's QR link, or null if there is none. */
export async function getAlbumByToken(token: string): Promise<PublicAlbum | null> {
  const { data, error } = await createServiceRoleClient()
    .from("event_albums")
    .select("event_id, events(couple_names, event_date, personal_data_erased_at, venues(name))")
    .eq("public_token", token)
    .maybeSingle();
  if (error) throw error;
  const event = data?.events as unknown as
    | { couple_names: string; event_date: string; personal_data_erased_at: string | null; venues: { name: string } | null }
    | null;
  if (!data || !event || event.personal_data_erased_at) return null;
  return { eventId: data.event_id, coupleNames: event.couple_names, eventDate: event.event_date, venueName: event.venues?.name ?? "" };
}

/**
 * Album space for the event from its package's `storage_gb` entitlement
 * (null = unlimited). A failed read throws, so uploads fail closed.
 */
export async function getStorageLimitBytes(eventId: string): Promise<number | null> {
  return storageLimitBytes((await getEventFeatures(eventId)).storage_gb);
}

export async function getStorageUsage(eventId: string): Promise<StorageUsage> {
  const [limitBytes, { data, error }] = await Promise.all([
    getStorageLimitBytes(eventId),
    createServiceRoleClient().rpc("event_media_usage", { p_event_id: eventId }),
  ]);
  if (error) throw error;
  const row = (data as { photo_bytes: number; video_bytes: number }[])[0];
  return { limitBytes, photoBytes: Number(row?.photo_bytes ?? 0), videoBytes: Number(row?.video_bytes ?? 0) };
}

/** Throws QUOTA_FULL_ERROR when `extraBytes` more would not fit in the album. */
export async function assertQuotaFor(eventId: string, extraBytes: number): Promise<void> {
  const { limitBytes, photoBytes, videoBytes } = await getStorageUsage(eventId);
  if (!fitsQuota(limitBytes, photoBytes + videoBytes, extraBytes)) throw new Error(QUOTA_FULL_ERROR);
}
