import { NextResponse } from "next/server";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { RSVP_INVALID_ERROR, RSVP_NOT_FOUND_ERROR, rsvpBody, slugParams } from "@/lib/api/schemas";
import { submitRsvpBySlug } from "@/lib/couple/rsvp";
import { REQUEST_ID_HEADER } from "@/lib/log";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// The slug and body are checked by the wrapper, outside the error boundary
// (as the field check always was): a malformed slug answers exactly like an
// unknown one ("Invitation not found."), and a missing/mistyped full_name or
// attending keeps "full_name and attending are required.". The handler keeps
// its own try/catch around the domain call instead of `fallbackError`.
export const POST = withPublic(
  async ({ request, params, body }) => {
    // SEC-002: 20 answers per hour per IP per invitation.
    const limit = await checkRateLimit(RATE_LIMITS.rsvp, `${params.slug}:${clientIp(request)}`);
    if (!limit.ok) return rateLimitedResponse(limit);
    try {
      await submitRsvpBySlug(
        params.slug,
        { fullName: body.full_name, attending: body.attending, partySize: body.party_size ?? 1 },
        { ip: clientIp(request), requestId: request.headers.get(REQUEST_ID_HEADER) },
      );
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Failed to submit RSVP.", request);
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
