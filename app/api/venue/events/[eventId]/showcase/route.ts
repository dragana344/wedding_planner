import { NextResponse } from "next/server";
import { z } from "zod";
import { requireManagerForEvent } from "@/lib/venue/event-guard";
import { createVenuePhotoUpload } from "@/lib/venue/photo-upload";
import { withPublic } from "@/lib/api/handler";
import { uuid } from "@/lib/api/schemas";

// Фотографии за промоција, step 1 (manager-only, 0109): a one-time signed
// upload into the venue's pending folder; ./confirm checks and attaches it.

export const POST = withPublic(
  async ({ request, params }) => {
    const guard = await requireManagerForEvent(request, params.eventId);
    if (guard instanceof NextResponse) return guard;
    return NextResponse.json(await createVenuePhotoUpload(guard.venueId));
  },
  { params: z.object({ eventId: uuid }), fallbackError: "Не успеа прикачувањето на фотографијата." },
);
