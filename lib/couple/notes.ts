// lib/couple/notes.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { MAX_LIST_ROWS, checkListBound } from "@/lib/list-bound";

export interface Note {
  id: string;
  event_id: string;
  title: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface NoteInput {
  title: string | null;
  content: string;
}

const COLUMNS = "id, event_id, title, content, created_at, updated_at";

export async function listNotes(eventId: string): Promise<Note[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_notes")
    .select(COLUMNS)
    .eq("event_id", eventId)
    .order("updated_at", { ascending: false })
    .limit(MAX_LIST_ROWS);
  if (error) throw error;
  return checkListBound(data, "event_notes");
}

export async function createNote(eventId: string, input: NoteInput): Promise<Note> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_notes")
    .insert({ event_id: eventId, ...input })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateNote(eventId: string, noteId: string, input: NoteInput): Promise<Note> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("event_notes")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("event_id", eventId)
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteNote(eventId: string, noteId: string): Promise<void> {
  const client = createServiceRoleClient();
  const { error } = await client.from("event_notes").delete().eq("id", noteId).eq("event_id", eventId);
  if (error) throw error;
}

// Pure display helper, kept in its own module so client components can use it
// without pulling this service-role module into the browser bundle.
export { deriveNoteDisplay } from "./note-display";
