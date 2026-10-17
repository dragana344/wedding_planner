import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { requireOwnerElevation } from "@/lib/venue/manager-guard";
import { removeVenueLogo } from "@/lib/venue/venue-profile";
import { createVenuePhotoUpload } from "@/lib/venue/photo-upload";
import { NOT_AUTHENTICATED_ERROR, withPublic } from "@/lib/api/handler";

// The venue's logo (Поставки → профил), owner-only like the rest of
// Settings (spec D4). Step 1 of an upload hands out a one-time signed URL
// (lib/venue/photo-upload.ts); ./confirm checks the file and attaches it.

const OWNER_REQUIRED_ERROR = "Потребна е најава како сопственик.";

async function ownerVenue(request: Request): Promise<string | NextResponse> {
  const venueId = await getCurrentVenueId(await createServerSupabaseClient());
  if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
  if (!(await requireOwnerElevation(request, venueId))) return NextResponse.json({ error: OWNER_REQUIRED_ERROR }, { status: 403 });
  return venueId;
}

export const POST = withPublic(
  async ({ request }) => {
    const venueId = await ownerVenue(request);
    if (typeof venueId !== "string") return venueId;
    return NextResponse.json(await createVenuePhotoUpload(venueId));
  },
  { fallbackError: "Не успеа прикачувањето на логото." },
);

export const DELETE = withPublic(
  async ({ request }) => {
    const venueId = await ownerVenue(request);
    if (typeof venueId !== "string") return venueId;
    await removeVenueLogo(venueId, createServiceRoleClient());
    return NextResponse.json({ ok: true });
  },
  { fallbackError: "Не успеа отстранувањето на логото." },
);
