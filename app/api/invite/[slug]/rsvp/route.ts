import { NextResponse } from "next/server";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { RSVP_FAILED_ERROR, RSVP_INVALID_ERROR, RSVP_NOT_FOUND_ERROR, rsvpBody, slugParams } from "@/lib/api/schemas";
import { submitRsvpBySlug } from "@/lib/couple/rsvp";
import { REQUEST_ID_HEADER } from "@/lib/log";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// The slug and body are checked by the wrapper, outside the error boundary
// (as the field check always was): a malformed slug answers exactly like an
// unknown one (RSVP_NOT_FOUND_ERROR), and a missing name/token or answer gets
// RSVP_REQUIRED_ERROR. The handler keeps its own try/catch around the domain
// call instead of `fallbackError`.
export const POST = withPublic(
  async ({ request, params, body }) => {
    // SEC-002: 20 answers per hour per IP per invitation.
    const limit = await checkRateLimit(RATE_LIMITS.rsvp, `${params.slug}:${clientIp(request)}`);
    if (!limit.ok) return rateLimitedResponse(limit);
    try {
      await submitRsvpBySlug(
        params.slug,
        {
          ...(body.guest_token ? { guestToken: body.guest_token } : { fullName: body.full_name }),
          status: body.status ?? (body.attending ? "confirmed" : "declined"),
          partySize: body.party_size ?? 1,
          childrenCount: body.children_count,
          menuChoice: body.menu_choice,
          allergies: body.allergies,
          comment: body.comment,
        },
        { ip: clientIp(request), requestId: request.headers.get(REQUEST_ID_HEADER) },
      );
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, RSVP_FAILED_ERROR, request);
    }
  },
  {
    invalidJsonError: "Invalid JSON body",
    params: slugParams,
    invalidParamsError: RSVP_NOT_FOUND_ERROR,
    body: rsvpBody,
    invalidBodyError: RSVP_INVALID_ERROR,
  },
);
