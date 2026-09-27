// lib/couple/notes.ts
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
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

/**
 * List-row display for a note, matching how Apple Notes derives a title:
 * an explicit title wins; otherwise the first non-blank line of the content
 * becomes the title and the next non-blank line becomes the preview. An
 * explicit title always pairs with the content's first non-blank line as
 * its preview, since in that case the title hasn't "consumed" any of it.
 */
export function deriveNoteDisplay(title: string | null, content: string): { title: string; preview: string } {
  const lines = content.split("\n").map((l) => l.trim());
  const nonBlank = lines.filter((l) => l.length > 0);
  const explicitTitle = title?.trim();

  if (explicitTitle) {
    return { title: explicitTitle, preview: nonBlank[0] ?? "" };
  }
  return { title: nonBlank[0] ?? "Белешка без наслов", preview: nonBlank[1] ?? "" };
}
