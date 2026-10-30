import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";

export const USERNAME_TAKEN = "Корисничкото име е веќе зафатено. Изберете друго.";

/**
 * The couple-login errors staff can act on, as Macedonian messages: a taken
 * username comes back as a bare unique violation (23505), a too-short
 * password as 22023 with the database's own Macedonian text. Anything else
 * is returned unchanged (and shown as the route's generic message).
 */
export function credentialsError<E extends { code?: string; message: string }>(error: E): Error | E {
  if (error.code === "23505") return new Error(USERNAME_TAKEN);
  if (error.code === "22023" && /[А-Яа-я]/.test(error.message)) return new Error(error.message);
  return error;
}

export async function createEventCredentials(
  eventId: string,
  username: string,
  password: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  const { error } = await client.rpc("create_event_credentials", {
    p_event_id: eventId,
    p_username: username,
    p_password: password,
  });
  if (error) throw credentialsError(error);
}

export async function regenerateEventPassword(
  eventId: string,
  password: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<void> {
  const { error } = await client.rpc("regenerate_event_password", {
    p_event_id: eventId,
    p_password: password,
  });
  if (error) throw error;
}

export async function getEventUsername(
  eventId: string,
  client: SupabaseClient = resolveSupabaseClient()
): Promise<string | null> {
  const { data, error } = await client.rpc("get_event_username", { p_event_id: eventId });
  if (error) throw error;
  return data;
}

export function generateRandomPassword(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}
