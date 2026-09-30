import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { GuestSide } from "@/lib/couple/guests";

// A12: the couple's second logins, one per side of the family. Managed by the
// couple's own login only (the routes refuse co-organizers).

export interface CoOrganizer {
  id: string;
  side: GuestSide;
  username: string;
  created_at: string;
}

const COLUMNS = "id, side, username, created_at";

/** Messages the database raises on purpose (0061), passed through as-is. */
const DB_MESSAGES = ["Лозинката мора да има најмалку 10 знаци.", "Корисничкото име е зафатено."];

function userFacing(error: { message: string; code?: string }): Error {
  const known = DB_MESSAGES.find((m) => error.message.includes(m));
  if (known) return new Error(known);
  if (error.code === "23505" && error.message.includes("one_per_side")) return new Error("Оваа страна веќе има ко-организатор.");
  return Object.assign(new Error(error.message), { code: error.code });
}

export async function listCoOrganizers(eventId: string): Promise<CoOrganizer[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_co_organizers").select(COLUMNS).eq("event_id", eventId).order("side");
  if (error) throw error;
  return data as CoOrganizer[];
}

export async function createCoOrganizer(
  eventId: string,
  input: { side: GuestSide; username: string; password: string },
): Promise<CoOrganizer> {
  const client = createServiceRoleClient();
  const { data: id, error } = await client.rpc("create_co_organizer", {
    p_event_id: eventId,
    p_side: input.side,
    p_username: input.username.trim(),
    p_password: input.password,
  });
  if (error) throw userFacing(error);
  const { data, error: readError } = await client.from("event_co_organizers").select(COLUMNS).eq("id", id).single();
  if (readError) throw readError;
  return data as CoOrganizer;
}

async function assertOwn(eventId: string, id: string): Promise<void> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_co_organizers").select("id").eq("id", id).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Ко-организаторот не е пронајден.");
}

/** A new password; ends that co-organizer's sessions. */
export async function resetCoOrganizerPassword(eventId: string, id: string, password: string): Promise<void> {
  await assertOwn(eventId, id);
  const client = createServiceRoleClient();
  const { error } = await client.rpc("reset_co_organizer_password", { p_id: id, p_password: password });
  if (error) throw userFacing(error);
}

/** Removes the login; its sessions go with it (cascade). */
export async function deleteCoOrganizer(eventId: string, id: string): Promise<void> {
  const client = createServiceRoleClient();
  const { error } = await client.from("event_co_organizers").delete().eq("id", id).eq("event_id", eventId);
  if (error) throw error;
}
