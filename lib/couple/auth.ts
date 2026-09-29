// lib/couple/auth.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function verifyEventCredentials(
  username: string,
  password: string
): Promise<{ eventId: string } | { errorCode: "invalid" | "locked" }> {
  const client = createServiceRoleClient();
  const { data, error } = await client.rpc("verify_event_credentials", {
    p_username: username,
    p_password: password,
  });
  if (error) throw error;
  const row = data?.[0];
  if (row?.event_id) return { eventId: row.event_id };
  return { errorCode: (row?.error_code as "invalid" | "locked") ?? "invalid" };
}

/**
 * The couple's own login or a co-organizer's (A12, `verify_couple_login`):
 * `organizerId`/`side` are null for the couple.
 */
export async function verifyCoupleLogin(
  username: string,
  password: string,
): Promise<{ eventId: string; organizerId: string | null; side: "bride" | "groom" | null } | { errorCode: "invalid" | "locked" }> {
  const client = createServiceRoleClient();
  const { data, error } = await client.rpc("verify_couple_login", { p_username: username, p_password: password });
  if (error) throw error;
  const row = data?.[0];
  if (row?.event_id) return { eventId: row.event_id, organizerId: row.organizer_id ?? null, side: row.side ?? null };
  return { errorCode: (row?.error_code as "invalid" | "locked") ?? "invalid" };
}
