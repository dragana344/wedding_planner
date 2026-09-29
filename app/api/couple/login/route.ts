// app/api/couple/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { INVALID_INPUT_ERROR, INVALID_JSON_ERROR, loginBody, parseInput } from "@/lib/api/schemas";
import { verifyEventCredentials } from "@/lib/couple/auth";
import { createCoupleSession } from "@/lib/couple/session-token";
import { withRequestLog } from "@/lib/api/handler";
import { logSecurityEvent } from "@/lib/log";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";

const MESSAGES: Record<"invalid" | "locked", string> = {
  invalid: "Неточно корисничко име или лозинка.",
  locked: "Премногу обиди. Обидете се повторно за неколку минути.",
};

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

  const result = await verifyEventCredentials(username, password);
  if ("errorCode" in result) {
    logSecurityEvent(result.errorCode === "locked" ? "couple_login_locked" : "couple_login_failed");
    return NextResponse.json({ error: MESSAGES[result.errorCode] }, { status: 401 });
  }
  logSecurityEvent("couple_login_succeeded", { event_id: result.eventId });

  const { token, expiresAt } = await createCoupleSession(result.eventId);
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
