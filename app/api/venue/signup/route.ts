import { NextRequest, NextResponse } from "next/server";
import { parseInput, VENUE_NAME_REQUIRED_ERROR, venueSignupBody } from "@/lib/api/schemas";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { provisionVenueForUser } from "@/lib/venue/provisioning";
import { errorResponse, withRequestLog } from "@/lib/api/handler";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";
import { logSecurityEvent } from "@/lib/log";

export async function POST(request: NextRequest) {
  return withRequestLog(request, () => signup(request));
}

async function signup(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // SEC-002: 5 venue provisionings per hour per IP; fails closed.
  const limit = await checkRateLimit(RATE_LIMITS.venueSignup, clientIp(request));
  if (!limit.ok) return rateLimitedResponse(limit);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseInput(venueSignupBody, rawBody, VENUE_NAME_REQUIRED_ERROR);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await provisionVenueForUser(user.id, parsed.data.venue_name.trim());
    logSecurityEvent("venue_signup", { user_id: user.id, venue_id: result.venue_id });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "Failed to create venue.", request);
  }
}
