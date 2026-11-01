import "server-only";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { requireManagerElevation, type ManagerGuardResult } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR } from "@/lib/api/handler";

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";
const EVENT_NOT_FOUND_ERROR = "Настанот не е пронајден.";

/**
 * For a route that writes one event's data with the service-role client:
 * the caller is signed in to a venue, holds a manager elevation for it, and
 * the event is that venue's. Returns the venue id and the manager's name, or the response to send.
 */
export async function requireManagerForEvent(request: Request, eventId: string): Promise<{ venueId: string; managerName: string } | NextResponse> {
  const venueId = await getCurrentVenueId(await createServerSupabaseClient());
  if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
  const manager = await requireManagerElevation(request, venueId);
  if (!manager) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
  const { data, error } = await createServiceRoleClient().from("events").select("id").eq("id", eventId).eq("venue_id", venueId).maybeSingle();
  if (error) throw error;
  if (!data) return NextResponse.json({ error: EVENT_NOT_FOUND_ERROR }, { status: 404 });
  return { venueId, managerName: manager.managerName };
}

/**
 * For a route any signed-in staff member of the event's venue may read. A
 * manager is told apart only by a valid elevation token; none is not an error.
 */
export async function requireStaffForEvent(
  request: Request,
  eventId: string,
): Promise<{ venueId: string; manager: ManagerGuardResult | null } | NextResponse> {
  const venueId = await getCurrentVenueId(await createServerSupabaseClient());
  if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
  const { data, error } = await createServiceRoleClient().from("events").select("id").eq("id", eventId).eq("venue_id", venueId).maybeSingle();
  if (error) throw error;
  if (!data) return NextResponse.json({ error: EVENT_NOT_FOUND_ERROR }, { status: 404 });
  return { venueId, manager: await requireManagerElevation(request, venueId) };
}
