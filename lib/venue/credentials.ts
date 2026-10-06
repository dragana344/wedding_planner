import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSupabaseClient } from "@/lib/supabase/resolve-client";

export const USERNAME_TAKEN = "Корисничкото име е веќе зафатено. Изберете друго.";

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
  // A taken username comes back as a bare unique violation (23505), in
  // English or not at all: say what is wrong so staff can pick another name.
  if (error?.code === "23505") throw new Error(USERNAME_TAKEN);
  if (error?.code === "22023" && /[А-Яа-я]/.test(error.message)) throw new Error(error.message);
  if (error) throw error;
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
