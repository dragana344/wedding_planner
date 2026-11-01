import { NextResponse } from "next/server";
import { errorResponse, withCoupleEvent } from "@/lib/api/handler";
import { contactInfoBody } from "@/lib/api/schemas";
import { coupleChangerName } from "@/lib/changes/server";
import { organizerSide } from "@/lib/couple/organizer-side";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// No fallbackError: this route never caught handler errors, so they still
// propagate to Next.js unchanged.
export const PATCH = withCoupleEvent(
  async ({ eventId, body, request }) => {
    const client = createServiceRoleClient();
    const { error } = await client.rpc("couple_set_contact_info", {
      p_event_id: eventId,
      p_email: body.contact_email ?? null,
      p_email_2: body.contact_email_2 ?? null,
      p_phone: body.contact_phone ?? null,
      p_changed_by: coupleChangerName(organizerSide(request)),
    });
    if (error) return errorResponse(error, "Не успеа зачувувањето на контакт податоците.", request); // SEC-003 / SR-04
    return NextResponse.json({ ok: true });
  },
  { invalidJsonError: "Неважечко JSON тело", body: contactInfoBody },
);
