import { NextResponse } from "next/server";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, DEMO_REQUIRED_ERROR, demoRequestBody } from "@/lib/api/schemas";
import { submitDemoRequest } from "@/lib/venue/contact";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// /signup's "request a demo" form. Same shape as /api/venue/contact: public,
// rate-limited, stored for the admin inbox (Пораки) as a 'demo' row.
export const POST = withPublic(
  async ({ request, body }) => {
    // SEC-002: 5 requests per hour per IP; fails closed if the limiter is down.
    const limit = await checkRateLimit(RATE_LIMITS.demoRequest, clientIp(request));
    if (!limit.ok) return rateLimitedResponse(limit);
    try {
      await submitDemoRequest({
        name: body.name,
        venueName: body.venue_name,
        city: body.city,
        phone: body.phone,
        email: body.email,
        message: body.message,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Барањето не се испрати. Обидете се повторно.", request);
    }
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: demoRequestBody, invalidBodyError: DEMO_REQUIRED_ERROR },
);
