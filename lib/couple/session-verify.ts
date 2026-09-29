// lib/couple/session-verify.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashSessionToken } from "@/lib/couple/session-hash";

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_LOOKUP_TIMEOUT_MS = 3000;
export const SESSION_DURATION_MS = 30 * DAY_MS;

// Middleware validates the session on every couple request. Sliding the
// expiry on each of those would write to the database per request; renew at
// most once a day instead (SEC-008).
const RENEW_WHEN_REMAINING_BELOW_MS = SESSION_DURATION_MS - DAY_MS;

export async function validateAndRenewCoupleSession(token: string): Promise<{ eventId: string } | null> {
  const client = createServiceRoleClient();
  const tokenHash = await hashSessionToken(token);

  // No fallback lookup by the raw value: that would let a leaked hash be
  // replayed as a cookie. Sessions created by the previous app version in the
  // minutes between migration 0032 and the app deploy simply need a new login.
  // REL-004: middleware awaits this on every couple request; bound it (the
  // abort also stops supabase-js's retries) so a stalled database cannot hang
  // the whole couple area.
  const { data } = await client
    .from("couple_sessions")
    .select("event_id, expires_at")
    .eq("token", tokenHash)
    .abortSignal(AbortSignal.timeout(SESSION_LOOKUP_TIMEOUT_MS))
    .maybeSingle();

  if (!data) return null;
  const expiresAt = new Date(data.expires_at).getTime();
  if (expiresAt <= Date.now()) return null;

  if (expiresAt - Date.now() < RENEW_WHEN_REMAINING_BELOW_MS) {
    const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    await client.from("couple_sessions").update({ expires_at: newExpiresAt }).eq("token", tokenHash);
  }

  return { eventId: data.event_id };
}

export async function deleteCoupleSession(token: string): Promise<void> {
  const client = createServiceRoleClient();
  await client.from("couple_sessions").delete().eq("token", await hashSessionToken(token));
}
