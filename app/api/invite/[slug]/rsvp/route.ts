import { NextResponse } from "next/server";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { RSVP_FAILED_ERROR, RSVP_INVALID_ERROR, RSVP_NOT_FOUND_ERROR, rsvpBody, slugParams } from "@/lib/api/schemas";
import { submitRsvpBySlug } from "@/lib/couple/rsvp";
import { hasGreeted, issueAnswerGreetingTicket, issueGreetingTicket } from "@/lib/couple/invite-greetings";
import { REQUEST_ID_HEADER } from "@/lib/log";
import { GUEST_CHANGER, noteNumbersChange } from "@/lib/couple/numbers-changes";
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
      const saved = await submitRsvpBySlug(
        params.slug,
        {
          ...(body.guest_token ? { guestToken: body.guest_token } : { fullName: body.full_name }),
          status: body.status ?? (body.attending ? "confirmed" : "declined"),
          partySize: body.party_size ?? 1,
          childrenCount: body.children_count,
          menuCounts: body.menu_counts,
          noMealCount: body.no_meal_count,
          allergies: body.allergies,
          comment: body.comment,
          householdNames: body.household_names,
          phone: body.phone,
          remember: body.remember,
        },
        { ip: clientIp(request), requestId: request.headers.get(REQUEST_ID_HEADER) },
      );
      // An answer waiting for the couple ("Да се провери", 0179) names no
      // guest yet: the guest gets the same thank-you, without a "remember
      // me" token, and a greeting ticket tied to the answer itself (0180) —
      // the greeting moves to the guest once the couple says who it is.
      if (!saved.guestId) {
        return NextResponse.json({
          ok: true,
          ...(saved.answerId ? { greeting: { ticket: issueAnswerGreetingTicket(saved.eventId, saved.answerId), sent: false } } : {}),
        });
      }
      await noteNumbersChange(saved.eventId, GUEST_CHANGER);
      // 0151: the greeting form that follows the answer sends this ticket to
      // say which guest it is from (on the shared link nothing else does).
      const greeted = await hasGreeted(saved.guestId).catch(() => false);
      return NextResponse.json({
        ok: true,
        greeting: { ticket: issueGreetingTicket(saved.eventId, saved.guestId), sent: greeted },
        ...(saved.remember ? { remember: saved.remember } : {}),
      });
    } catch (err) {
      return errorResponse(err, RSVP_FAILED_ERROR, request);
    }
  },
  {
    invalidJsonError: RSVP_INVALID_ERROR,
    params: slugParams,
    invalidParamsError: RSVP_NOT_FOUND_ERROR,
    body: rsvpBody,
    invalidBodyError: RSVP_INVALID_ERROR,
  },
);
