import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type GuestReply = {
  id: string;
  guestId: string | null;
  guestName: string | null;
  at: string;
  previousStatus: string | null;
  newStatus: string;
};

/** Guests' answers through the invitation link, newest first. */
export async function listGuestReplies(eventId: string): Promise<GuestReply[]> {
  const client = createServiceRoleClient();
  const { data, error } = await client
    .from("audit_log")
    .select("id, occurred_at, target_id, details")
    .eq("event_id", eventId)
    .eq("action", "public_rsvp")
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Could not load the guests' replies: ${error.message}`);
  const rows = data ?? [];
  const guestIds = [...new Set(rows.map((r) => r.target_id as string | null).filter((id): id is string => id !== null))];
  const names = new Map<string, string>();
  if (guestIds.length > 0) {
    const { data: guests, error: guestError } = await client.from("event_guests").select("id, full_name").eq("event_id", eventId).in("id", guestIds);
    if (guestError) throw new Error(`Could not load the guests' names: ${guestError.message}`);
    for (const g of guests ?? []) names.set(g.id as string, g.full_name as string);
  }
  return rows.map((r) => {
    const details = (r.details ?? {}) as { previous_status?: unknown; new_status?: unknown };
    const guestId = (r.target_id as string | null) ?? null;
    return {
      id: String(r.id),
      guestId,
      guestName: guestId ? (names.get(guestId) ?? null) : null,
      at: r.occurred_at as string,
      previousStatus: typeof details.previous_status === "string" ? details.previous_status : null,
      newStatus: typeof details.new_status === "string" ? details.new_status : "",
    };
  });
}
