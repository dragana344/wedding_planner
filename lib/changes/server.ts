import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { EventChange, SeenSection, Side } from "./types";

type ChangeRow = {
  id: string;
  event_id: string;
  section: EventChange["section"];
  side: Side;
  changed_by: string | null;
  field: string;
  old_value: unknown;
  new_value: unknown;
  changed_at: string;
};

/** An event's change log, oldest first; `since` (exclusive) limits it to newer changes. */
export async function listEventChanges(eventId: string, since?: string): Promise<EventChange[]> {
  const supabase = createServiceRoleClient();
  let query = supabase
    .from("event_changes")
    .select("id, event_id, section, side, changed_by, field, old_value, new_value, changed_at")
    .eq("event_id", eventId);
  if (since) query = query.gt("changed_at", since);
  const { data, error } = await query.order("changed_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw new Error(`Could not load the event's changes: ${error.message}`);
  return ((data ?? []) as ChangeRow[]).map((r) => ({
    id: r.id,
    eventId: r.event_id,
    section: r.section,
    side: r.side,
    changedBy: r.changed_by,
    field: r.field,
    oldValue: r.old_value,
    newValue: r.new_value,
    changedAt: r.changed_at,
  }));
}

/** How far a side has seen, per section; a missing section has never been seen. */
export async function getSeen(eventId: string, viewer: Side): Promise<Partial<Record<SeenSection, string>>> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("event_change_seen")
    .select("section, seen_up_to")
    .eq("event_id", eventId)
    .eq("viewer", viewer);
  if (error) throw new Error(`Could not load what was seen: ${error.message}`);
  const out: Partial<Record<SeenSection, string>> = {};
  for (const r of data ?? []) out[r.section as SeenSection] = r.seen_up_to as string;
  return out;
}

/** "Видено" up to `upTo`. The stored position only ever moves forward. */
export async function markSeen(eventId: string, viewer: Side, section: SeenSection, upTo: string, seenBy: string | null): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("mark_change_seen", {
    p_event_id: eventId,
    p_viewer: viewer,
    p_section: section,
    p_up_to: upTo,
    p_seen_by: seenBy,
  });
  if (error) throw new Error(`Could not mark the changes as seen: ${error.message}`);
}

export async function getCoupleFirstLogin(eventId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.from("events").select("couple_first_login_at").eq("id", eventId).maybeSingle();
  if (error) throw new Error(`Could not load the couple's first login: ${error.message}`);
  return (data?.couple_first_login_at as string | null | undefined) ?? null;
}

/** Display name for a couple-side change: the main login is "the couple", anyone else a co-organizer. */
export function coupleChangerName(side: "bride" | "groom" | null): string {
  return side === null ? "Младенците" : "Ко-организатор";
}
