import "server-only";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR } from "@/lib/api/handler";

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";
const EVENT_NOT_FOUND_ERROR = "Настанот не е пронајден.";

/**
 * For a route that writes one event's data with the service-role client:
 * the caller is signed in to a venue, holds a manager elevation for it, and
 * the event is that venue's. Returns the venue id, or the response to send.
 */
export async function requireManagerForEvent(request: Request, eventId: string): Promise<{ venueId: string } | NextResponse> {
  const venueId = await getCurrentVenueId(await createServerSupabaseClient());
  if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
  if (!(await requireManagerElevation(request, venueId))) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
  const { data, error } = await createServiceRoleClient().from("events").select("id").eq("id", eventId).eq("venue_id", venueId).maybeSingle();
  if (error) throw error;
  if (!data) return NextResponse.json({ error: EVENT_NOT_FOUND_ERROR }, { status: 404 });
  return { venueId };
}
