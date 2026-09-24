import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface Location {
  id: string;
  event_id: string;
  label: string;
  address: string | null;
  map_url: string | null;
  sort_order: number;
}

export interface LocationInput {
  label: string;
  address: string | null;
  map_url: string | null;
}

const COLUMNS = "id, event_id, label, address, map_url, sort_order";

export async function listLocations(eventId: string): Promise<Location[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_locations").select(COLUMNS).eq("event_id", eventId).order("sort_order");
  if (error) throw error;
  return data;
}

export async function addLocation(eventId: string, input: LocationInput): Promise<Location> {
  const client = createServiceRoleClient();
  const { data: last } = await client
    .from("event_locations")
    .select("sort_order")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextSortOrder = last && last.length > 0 ? last[0].sort_order + 1 : 0;
  const { data, error } = await client
    .from("event_locations")
    .insert({ event_id: eventId, ...input, sort_order: nextSortOrder })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateLocation(eventId: string, locationId: string, input: LocationInput): Promise<Location> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_locations")
    .update(input)
    .eq("id", locationId)
    .eq("event_id", eventId)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLocation(eventId: string, locationId: string): Promise<void> {
  const client = createServiceRoleClient();
  const { error } = await client.from("event_locations").delete().eq("id", locationId).eq("event_id", eventId);
  if (error) throw error;
}
