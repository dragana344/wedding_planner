// lib/couple/session-verify.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashSessionToken } from "@/lib/couple/session-hash";
import { eventAccessPhase, type CoupleAccessPhase, type CoupleAccessRow } from "@/lib/couple/access";

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_LOOKUP_TIMEOUT_MS = 3000;
export const SESSION_DURATION_MS = 30 * DAY_MS;
export const SESSION_MAX_AGE_MS = 90 * DAY_MS;

// Middleware validates the session on every couple request. Sliding the
// expiry on each of those would write to the database per request; renew at
// most once a day instead (SEC-008).
const RENEW_WHEN_REMAINING_BELOW_MS = SESSION_DURATION_MS - DAY_MS;

/** Set by proxy.ts for a co-organizer's session (A12): "bride" or "groom". Never trusted from the browser. */
export const COUPLE_ORGANIZER_SIDE_HEADER = "x-couple-organizer-side";

export type CoupleSession = {
  eventId: string;
  organizerSide: "bride" | "groom" | null;
  /** Where the event is in the couple's access life cycle (lib/couple/access.ts). */
  phase: Exclude<CoupleAccessPhase, "closed">;
};

/** A valid session, or a valid one refused because the event's access has closed. */
export type CoupleSessionCheck = { session: CoupleSession } | { closed: true };

export async function validateAndRenewCoupleSession(token: string): Promise<CoupleSession | null> {
  const result = await checkCoupleSession(token);
  return result && "session" in result ? result.session : null;
}

/**
 * Same as validateAndRenewCoupleSession, but tells a closed event apart
 * from a missing/expired session, so proxy.ts can explain why the couple
 * was signed out.
 */
export async function checkCoupleSession(token: string): Promise<CoupleSessionCheck | null> {
  const client = createServiceRoleClient();
  const tokenHash = await hashSessionToken(token);

  // No fallback lookup by the raw value: that would let a leaked hash be
  // replayed as a cookie. Sessions created by the previous app version in the
  // minutes between migration 0032 and the app deploy simply need a new login.
  // REL-004: middleware awaits this on every couple request; bound it (the
  // abort also stops supabase-js's retries) so a stalled database cannot hang
  // the whole couple area.
  // events(venues(blocked_at)) joins onto this same lookup (no extra round
  // trip): admin spec D8 refuses a blocked venue's couple sessions. The
  // event's access columns ride on the same join (group A task 2).
  const { data } = await client
    .from("couple_sessions")
    .select(
      "event_id, expires_at, created_at, event_co_organizers(side), events(event_date, couple_access_until, couple_access_extended_until, personal_data_erased_at, venues(blocked_at))",
    )
    .eq("token", tokenHash)
    .abortSignal(AbortSignal.timeout(SESSION_LOOKUP_TIMEOUT_MS))
    .maybeSingle();

  if (!data) return null;
  const event = (data as unknown as { events: (CoupleAccessRow & { venues: { blocked_at: string | null } | null }) | null }).events;
  if (!event || event.venues?.blocked_at) return null;
  const expiresAt = new Date(data.expires_at).getTime();
  if (expiresAt <= Date.now()) return null;
  // SEC-025 SR-06: sliding renewal never extends a session past 90 days from
  // login; then the couple signs in again.
  if (Date.now() - new Date(data.created_at).getTime() > SESSION_MAX_AGE_MS) return null;
  const phase = eventAccessPhase(event);
  if (phase === "closed") return { closed: true };

  if (expiresAt - Date.now() < RENEW_WHEN_REMAINING_BELOW_MS) {
    const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
    await client.from("couple_sessions").update({ expires_at: newExpiresAt }).eq("token", tokenHash);
  }

  const organizer = data.event_co_organizers as unknown as { side: "bride" | "groom" } | null;
  return { session: { eventId: data.event_id, organizerSide: organizer?.side ?? null, phase } };
}

export async function deleteCoupleSession(token: string): Promise<void> {
  const client = createServiceRoleClient();
  await client.from("couple_sessions").delete().eq("token", await hashSessionToken(token));
}
