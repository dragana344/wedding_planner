import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";

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
