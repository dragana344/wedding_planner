// lib/couple/session-token.ts
import "server-only";
import { randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { hashSessionToken } from "@/lib/couple/session-hash";
import { SESSION_DURATION_MS } from "@/lib/couple/session-verify";

export { validateAndRenewCoupleSession, deleteCoupleSession } from "@/lib/couple/session-verify";

/** Returns the raw token for the cookie; only its SHA-256 is stored. */
/** `organizerId` is set for a co-organizer's login (A12), null for the couple's own. */
export async function createCoupleSession(eventId: string, organizerId: string | null = null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const client = createServiceRoleClient();
  const { error } = await client
    .from("couple_sessions")
    .insert({ token: await hashSessionToken(token), event_id: eventId, organizer_id: organizerId, expires_at: expiresAt.toISOString() });
  if (error) throw error;
  return { token, expiresAt };
}
