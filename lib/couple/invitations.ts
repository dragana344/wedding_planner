// lib/couple/invitations.ts
import { randomBytes } from "crypto";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface Invitation {
  event_id: string;
  template_id: string;
  message: string | null;
  photo_path: string | null;
  public_slug: string;
}

export interface InvitationInput {
  template_id: string;
  message: string | null;
}

const COLUMNS = "event_id, template_id, message, photo_path, public_slug";
const BUCKET = "invitation-photos";

function generateSlug(): string {
  return randomBytes(9).toString("base64url");
}

export async function getInvitation(eventId: string): Promise<Invitation | null> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("event_invitations").select(COLUMNS).eq("event_id", eventId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertInvitation(eventId: string, input: InvitationInput): Promise<Invitation> {
  const client = createServiceRoleClient();
  const existing = await getInvitation(eventId);
  if (existing) {
    const { data, error } = await client
      .from("event_invitations")
      .update(input)
      .eq("event_id", eventId)
      .select(COLUMNS)
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await client
    .from("event_invitations")
    .insert({ event_id: eventId, ...input, public_slug: generateSlug() })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export function getInvitationPhotoUrl(photoPath: string | null): string | null {
  if (!photoPath) return null;
  const { data } = createServiceRoleClient().storage.from(BUCKET).getPublicUrl(photoPath);
  return data.publicUrl;
}

export async function uploadInvitationPhoto(eventId: string, file: File): Promise<string> {
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${eventId}-${Date.now()}.${extension}`;
  const client = createServiceRoleClient();
  const { error: uploadError } = await client.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { error } = await client.from("event_invitations").update({ photo_path: path }).eq("event_id", eventId);
  if (error) throw error;
  return path;
}

export interface PublicInvitation {
  couple_names: string;
  event_date: string;
  start_time: string | null;
  venue_name: string;
  room_names: string[];
  template_id: string;
  message: string | null;
  photo_path: string | null;
}

export async function getInvitationBySlug(slug: string): Promise<PublicInvitation | null> {
  const client = createServiceRoleClient();
  const { data: invitation, error } = await client
    .from("event_invitations")
    .select("event_id, template_id, message, photo_path")
    .eq("public_slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!invitation) return null;

  const { data: event } = await client
    .from("events")
    .select("couple_names, event_date, start_time, venue_id, event_rooms(rooms(name))")
    .eq("id", invitation.event_id)
    .single();
  if (!event) return null;

  const { data: venue } = await client.from("venues").select("name").eq("id", event.venue_id).single();
  const roomNames = ((event.event_rooms ?? []) as { rooms: { name: string } | { name: string }[] | null }[])
    .map((r) => (Array.isArray(r.rooms) ? r.rooms[0]?.name : r.rooms?.name))
    .filter((n): n is string => Boolean(n));

  return {
    couple_names: event.couple_names,
    event_date: event.event_date,
    start_time: event.start_time,
    venue_name: venue?.name ?? "",
    room_names: roomNames,
    template_id: invitation.template_id,
    message: invitation.message,
    photo_path: invitation.photo_path,
  };
}
