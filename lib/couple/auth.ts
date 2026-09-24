// lib/couple/auth.ts
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
