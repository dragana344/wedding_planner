import { NextResponse } from "next/server";
import { withPublic } from "@/lib/api/handler";
import { RSVP_NOT_FOUND_ERROR, seatLookupBody, slugParams } from "@/lib/api/schemas";
import { findSeatByName } from "@/lib/couple/guest-page";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// A16 "Каде седам?": a guest on the shared link types their name and gets
// their table. The answer is only `{ seat }`; an unknown name and a listed
// guest without a table look the same, so the list cannot be probed.
export const POST = withPublic(
  async ({ request, params, body }) => {
    const limit = await checkRateLimit(RATE_LIMITS.seatLookup, `${params.slug}:${clientIp(request)}`);
    if (!limit.ok) return rateLimitedResponse(limit);
    const { seat } = await findSeatByName(params.slug, body.name);
    return NextResponse.json({ seat });
  },
  {
    params: slugParams,
    invalidParamsError: RSVP_NOT_FOUND_ERROR,
    body: seatLookupBody,
    invalidBodyError: "Внесете име и презиме.",
    fallbackError: "Не успеа пребарувањето. Обидете се повторно.",
  },
);
