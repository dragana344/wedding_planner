import "server-only";
import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getEventById } from "@/lib/venue/events";
import { requestOrigin } from "@/lib/request-origin";

/** The signed-in staff client for an event of their own venue (404 otherwise), and this site's origin for QR links. */
export async function staffPrintAccess(eventId: string) {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  if (!venueId) notFound();
  const event = await getEventById(eventId, supabase);
  if (!event || event.venue_id !== venueId) notFound();
  return { supabase, origin: await requestOrigin() };
}
