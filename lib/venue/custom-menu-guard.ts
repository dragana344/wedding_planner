import "server-only";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR } from "@/lib/api/handler";
import { CustomMenuError } from "@/lib/venue/event-custom-menu";

/** Venue id of a signed-in manager, or the response to send. */
export async function requireManagerVenue(
  request: Request,
): Promise<{ venueId: string } | NextResponse> {
  const venueId = await getCurrentVenueId(await createServerSupabaseClient());
  if (!venueId)
    return NextResponse.json(
      { error: NOT_AUTHENTICATED_ERROR },
      { status: 401 },
    );
  if (!(await requireManagerElevation(request, venueId))) {
    return NextResponse.json(
      { error: "Потребна е најава како менаџер." },
      { status: 403 },
    );
  }
  return { venueId };
}

/** Runs a custom-menu action, turning its status-bearing refusals into responses. */
export async function runCustomMenuAction<T>(
  action: () => Promise<T>,
): Promise<NextResponse> {
  try {
    return NextResponse.json((await action()) ?? { ok: true });
  } catch (err) {
    if (err instanceof CustomMenuError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
