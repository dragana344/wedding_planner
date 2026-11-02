import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { requireOwnerElevation } from "@/lib/venue/manager-guard";
import { removeVenueLogo } from "@/lib/venue/venue-profile";
import { createVenuePhotoUpload } from "@/lib/venue/photo-upload";
import { NOT_AUTHENTICATED_ERROR, withPublic } from "@/lib/api/handler";
import { recordAudit } from "@/lib/audit";

// The venue's logo (Поставки → профил), owner-only like the rest of
// Settings (spec D4). Step 1 of an upload hands out a one-time signed URL
// (lib/venue/photo-upload.ts); ./confirm checks the file and attaches it.

const OWNER_REQUIRED_ERROR = "Потребна е најава како сопственик.";

async function ownerVenue(request: Request): Promise<{ venueId: string; managerName: string } | NextResponse> {
  const venueId = await getCurrentVenueId(await createServerSupabaseClient());
  if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
  const owner = await requireOwnerElevation(request, venueId);
  if (!owner) return NextResponse.json({ error: OWNER_REQUIRED_ERROR }, { status: 403 });
  return { venueId, managerName: owner.managerName };
}

export const POST = withPublic(
  async ({ request }) => {
    const ownerVenueResult = await ownerVenue(request);
    if (!("venueId" in ownerVenueResult)) return ownerVenueResult;
    return NextResponse.json(await createVenuePhotoUpload(ownerVenueResult.venueId));
  },
  { fallbackError: "Не успеа прикачувањето на логото." },
);

export const DELETE = withPublic(
  async ({ request }) => {
    const ownerVenueResult = await ownerVenue(request);
    if (!("venueId" in ownerVenueResult)) return ownerVenueResult;
    await removeVenueLogo(ownerVenueResult.venueId, createServiceRoleClient());
    // Logged for the audit trail only, same as the rest of Поставки (not shown in Известувања).
    await recordAudit({ action: "venue_logo_removed", actorType: "staff", venueId: ownerVenueResult.venueId, managerName: ownerVenueResult.managerName });
    return NextResponse.json({ ok: true });
  },
  { fallbackError: "Не успеа отстранувањето на логото." },
);
