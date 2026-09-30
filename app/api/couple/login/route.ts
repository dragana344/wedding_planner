// app/api/couple/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { INVALID_INPUT_ERROR, INVALID_JSON_ERROR, loginBody, parseInput } from "@/lib/api/schemas";
import { verifyCoupleLogin } from "@/lib/couple/auth";
import { createCoupleSession } from "@/lib/couple/session-token";
import { withRequestLog } from "@/lib/api/handler";
import { logSecurityEvent } from "@/lib/log";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Admin spec D8: verbatim copy for a blocked venue's couples.
const BLOCKED_VENUE_MESSAGE = "Пристапот е привремено оневозможен.";

// SEC-022: one answer for a wrong password, an unknown username and a locked
// account, so the response never confirms that a username exists.
const LOGIN_FAILED_MESSAGE =
  "Неточно корисничко име или лозинка. По повеќе неуспешни обиди најавата привремено се блокира — обидете се повторно за неколку минути.";

export async function POST(request: NextRequest) {
  return withRequestLog(request, () => login(request));
}

async function login(request: NextRequest) {
  // SEC-002: 10 attempts per minute per IP across all usernames (the DB
  // lockout covers one username); fails closed if the limiter is down.
  const limit = await checkRateLimit(RATE_LIMITS.coupleLogin, clientIp(request));
  if (!limit.ok) {
    if (limit.status === 429) logSecurityEvent("couple_login_rate_limited");
    return rateLimitedResponse(limit);
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: INVALID_JSON_ERROR }, { status: 400 });
  }
  // A non-object body keeps "Неважечко JSON тело"; a missing/empty username
  // or password keeps "Задолжителни се корисничкото име и лозинката.".
  const parsed = parseInput(loginBody, rawBody, INVALID_INPUT_ERROR);
  if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { username, password } = parsed.data;

  const result = await verifyCoupleLogin(username, password);
  if ("errorCode" in result) {
    logSecurityEvent(result.errorCode === "locked" ? "couple_login_locked" : "couple_login_failed");
    return NextResponse.json({ error: LOGIN_FAILED_MESSAGE }, { status: 401 });
  }

  // Admin spec D8: credentials are otherwise valid, but a blocked venue's
  // couples lose access. Checked via the service role: RLS on events/venues
  // is staff-scoped and would not answer for an anon caller anyway.
  // Fail closed: a lookup error must not fall through to "not blocked" and
  // let the login proceed — throwing here (same as the credential check's
  // own `if (error) throw error` above) reaches withRequestLog's catch,
  // which logs it and rethrows so Next.js answers its own generic 500,
  // before any session is ever created.
  const { data: venueState, error: venueStateError } = await createServiceRoleClient()
    .from("events")
    .select("venues(blocked_at)")
    .eq("id", result.eventId)
    .single();
  if (venueStateError) throw venueStateError;
  if ((venueState as unknown as { venues: { blocked_at: string | null } | null } | null)?.venues?.blocked_at) {
    logSecurityEvent("couple_login_blocked_venue", { event_id: result.eventId });
    return NextResponse.json({ error: BLOCKED_VENUE_MESSAGE }, { status: 403 });
  }

  logSecurityEvent("couple_login_succeeded", { event_id: result.eventId, ...(result.side ? { organizer_side: result.side } : {}) });

  const { token, expiresAt } = await createCoupleSession(result.eventId, result.organizerId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("couple_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return response;
}
