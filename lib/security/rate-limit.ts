import "server-only";
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Fixed-window rate limiting for public and credential endpoints (SEC-002),
 * counted in Postgres (migration 0037). Subjects (client IP, slug, event id)
 * are hashed before they are stored.
 *
 * `failClosed`: when the limiter itself is unavailable, routes that send
 * email, create accounts or check credentials refuse (503) rather than run
 * unlimited; everything else carries on unlimited (fail open).
 */
export type RateLimitRule = {
  bucket: string;
  limit: number;
  windowSeconds: number;
  failClosed: boolean;
};

export const RATE_LIMITS = {
  coupleLogin: { bucket: "couple-login", limit: 10, windowSeconds: 60, failClosed: true },
  venueSignup: { bucket: "venue-signup", limit: 5, windowSeconds: 3600, failClosed: true },
  contactForm: { bucket: "contact-form", limit: 5, windowSeconds: 3600, failClosed: true },
  rsvp: { bucket: "rsvp", limit: 20, windowSeconds: 3600, failClosed: false },
  invitationPhoto: { bucket: "invitation-photo", limit: 20, windowSeconds: 3600, failClosed: false },
} satisfies Record<string, RateLimitRule>;

/** Counts one hit for `key` in the current window and returns the window's total. */
export type RateLimitStore = (key: string, windowSeconds: number) => Promise<number>;

export const postgresRateLimitStore: RateLimitStore = async (key, windowSeconds) => {
  const { data, error } = await createServiceRoleClient()
    .rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds })
    .abortSignal(AbortSignal.timeout(2000));
  if (error) throw error;
  return data as number;
};

export type RateLimitResult = { ok: true } | { ok: false; status: 429 | 503 };

export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string,
  store: RateLimitStore = postgresRateLimitStore,
): Promise<RateLimitResult> {
  const key = `${rule.bucket}:${createHash("sha256").update(subject).digest("hex")}`;
  try {
    const hits = await store(key, rule.windowSeconds);
    return hits > rule.limit ? { ok: false, status: 429 } : { ok: true };
  } catch {
    return rule.failClosed ? { ok: false, status: 503 } : { ok: true };
  }
}

/**
 * The caller's IP as the platform proxy reports it. Vercel sets x-real-ip and
 * overwrites x-forwarded-for, so neither can be spoofed by the client there.
 */
export function clientIp(request: Request): string {
  return (
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export const RATE_LIMITED_MESSAGE = "Премногу обиди. Обидете се повторно подоцна.";
export const LIMITER_UNAVAILABLE_MESSAGE = "Услугата моментално не е достапна. Обидете се повторно за малку.";

/** The `{ error }` response for a refused request, in the routes' usual shape. */
export function rateLimitedResponse(result: { ok: false; status: 429 | 503 }): NextResponse {
  return NextResponse.json(
    { error: result.status === 429 ? RATE_LIMITED_MESSAGE : LIMITER_UNAVAILABLE_MESSAGE },
    { status: result.status, headers: result.status === 429 ? { "Retry-After": "60" } : undefined },
  );
}
