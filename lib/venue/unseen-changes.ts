import type { SupabaseClient } from "@supabase/supabase-js";
import type { SeenSection } from "@/lib/changes/types";

/** Couple changes (and menu numbers) the venue hasn't seen, grouped by event — one RPC per call. */
export async function listUnseenSections(venueId: string, client: SupabaseClient): Promise<Map<string, SeenSection[]>> {
  const { data, error } = await client.rpc("venue_unseen_change_sections", { p_venue_id: venueId });
  if (error) throw error;
  const byEvent = new Map<string, SeenSection[]>();
  for (const row of (data ?? []) as { event_id: string; section: SeenSection }[]) {
    const list = byEvent.get(row.event_id);
    if (list) list.push(row.section);
    else byEvent.set(row.event_id, [row.section]);
  }
  return byEvent;
}
