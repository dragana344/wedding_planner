import { NextResponse } from "next/server";
import { errorResponse, withCoupleEvent } from "@/lib/api/handler";
import { guestCountBody } from "@/lib/api/schemas";
import { coupleChangerName } from "@/lib/changes/server";
import { organizerSide } from "@/lib/couple/organizer-side";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Invalid JSON and a non-object body (e.g. JSON `null`) both return
// "Неважечко JSON тело" (400); a missing, negative or non-integer count
// returns the route's "не-негативен број" message. No fallbackError: this
// route never caught handler errors, so they still propagate to Next.js.
export const PATCH = withCoupleEvent(
  async ({ eventId, body, request }) => {
    const guestCount = body.guest_count_estimate;

    const client = createServiceRoleClient();
    const { error } = await client.rpc("couple_set_guest_count", {
      p_event_id: eventId,
      p_count: guestCount,
      p_changed_by: coupleChangerName(organizerSide(request)),
    });
    if (error) return errorResponse(error, "Не успеа зачувувањето на бројот на гости.", request); // SEC-003 / SR-04

    return NextResponse.json({ guest_count_estimate: guestCount });
  },
  { invalidJsonError: "Неважечко JSON тело", body: guestCountBody },
);
