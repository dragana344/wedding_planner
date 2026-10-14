import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { submitVenueSupportTicket } from "@/lib/venue/support";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { SUPPORT_TICKET_REQUIRED_ERROR, supportTicketBody } from "@/lib/api/schemas";

// Not actually public: the venue is resolved from the signed-in session
// below (never a client-supplied id), same as /api/venue/signup — withPublic
// here just means "no middleware-attached identity to read", not "no auth".
export const POST = withPublic(
  async ({ request, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: "Сесијата истече. Најавете се повторно." }, { status: 401 });
    try {
      const ticket = await submitVenueSupportTicket(venueId, body);
      return NextResponse.json({ ok: true, ticket });
    } catch (err) {
      return errorResponse(err, "Барањето не се испрати. Обидете се повторно.", request);
    }
  },
  { invalidJsonError: "Invalid JSON body", body: supportTicketBody, invalidBodyError: SUPPORT_TICKET_REQUIRED_ERROR },
);
