import { NextResponse } from "next/server";
import { errorResponse, withPublic } from "@/lib/api/handler";
import { CONTACT_REQUIRED_ERROR, contactMessageBody } from "@/lib/api/schemas";
import { submitContactMessage } from "@/lib/venue/contact";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

// The body is checked by the wrapper, outside the error boundary (as the
// field check always was), so the handler keeps its own try/catch around the
// domain call instead of `fallbackError`.
export const POST = withPublic(
  async ({ request, body }) => {
    // SEC-002: 5 messages per hour per IP; fails closed if the limiter is down.
    const limit = await checkRateLimit(RATE_LIMITS.contactForm, clientIp(request));
    if (!limit.ok) return rateLimitedResponse(limit);
    try {
      await submitContactMessage({ name: body.name, email: body.email, message: body.message });
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Failed to send message.", request);
    }
  },
  { invalidJsonError: "Invalid JSON body", body: contactMessageBody, invalidBodyError: CONTACT_REQUIRED_ERROR },
);
