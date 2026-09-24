// lib/couple/session-token.ts
import { randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export { validateAndRenewCoupleSession, deleteCoupleSession } from "@/lib/couple/session-verify";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export async function createCoupleSession(eventId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const client = createServiceRoleClient();
  const { error } = await client
    .from("couple_sessions")
    .insert({ token, event_id: eventId, expires_at: expiresAt.toISOString() });
  if (error) throw error;
  return { token, expiresAt };
}
