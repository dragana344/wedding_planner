import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { FEATURE_KEYS, type FeatureKey, type FeatureMap } from "@/lib/entitlements/features";

type Row = { feature_key: string; enabled: boolean; limit_value: number | null };

export function toFeatureMap(rows: Row[]): FeatureMap {
  const map = Object.fromEntries(FEATURE_KEYS.map((k) => [k, { enabled: false, limit: 0 }])) as FeatureMap;
  for (const r of rows) {
    if ((FEATURE_KEYS as readonly string[]).includes(r.feature_key)) {
      map[r.feature_key as FeatureKey] = { enabled: r.enabled, limit: r.limit_value };
    }
  }
  return map;
}

async function resolve(venueId: string, eventId: string | null): Promise<FeatureMap> {
  const { data, error } = await createServiceRoleClient().rpc("effective_features", { p_venue_id: venueId, p_event_id: eventId });
  if (error) throw error;
  return toFeatureMap(data as Row[]);
}

export async function getVenueFeatures(venueId: string): Promise<FeatureMap> {
  return resolve(venueId, null);
}

export async function getEventFeatures(eventId: string): Promise<FeatureMap> {
  const { data, error } = await createServiceRoleClient().from("events").select("venue_id").eq("id", eventId).single();
  if (error) throw error;
  return resolve(data.venue_id, eventId);
}

export async function eventHasFeature(eventId: string, key: FeatureKey): Promise<boolean> {
  const { data, error } = await createServiceRoleClient().rpc("event_has_feature", { p_event_id: eventId, p_key: key });
  if (error) throw error;
  return data === true;
}
