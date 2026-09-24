// lib/couple/session-verify.ts
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export async function validateAndRenewCoupleSession(token: string): Promise<{ eventId: string } | null> {
  const client = createServiceRoleClient();
  const { data } = await client
    .from("couple_sessions")
    .select("event_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  const newExpiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  await client.from("couple_sessions").update({ expires_at: newExpiresAt }).eq("token", token);

  return { eventId: data.event_id };
}

export async function deleteCoupleSession(token: string): Promise<void> {
  const client = createServiceRoleClient();
  await client.from("couple_sessions").delete().eq("token", token);
}
