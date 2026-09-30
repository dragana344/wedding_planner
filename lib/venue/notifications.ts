import type { SupabaseClient } from "@supabase/supabase-js";

// "Известувања" (B9): the venue's recent activity from the audit log (0042)
// plus newly created events, read with the staff client (RLS keeps it to the
// venue). The audit log never holds names, so couple names come from events.

export type NotificationKind =
  | "event_created"
  | "rsvp_changed"
  | "credentials_created"
  | "password_regenerated"
  | "event_deleted"
  | "data_erased"
  | "data_exported";

export interface VenueNotification {
  id: string;
  at: string;
  kind: NotificationKind;
  eventId: string | null;
  title: string;
  detail: string | null;
}

const ACTIONS: Record<string, { kind: NotificationKind; title: string }> = {
  public_rsvp: { kind: "rsvp_changed", title: "Одговор на поканата" },
  couple_credentials_created: { kind: "credentials_created", title: "Креирана најава за парот" },
  couple_password_regenerated: { kind: "password_regenerated", title: "Нова лозинка за парот" },
  event_deleted: { kind: "event_deleted", title: "Избришан настан" },
  event_personal_data_erased: { kind: "data_erased", title: "Избришани лични податоци" },
  privacy_export: { kind: "data_exported", title: "Извоз на податоци" },
};

const RSVP_LABELS: Record<string, string> = {
  pending: "Без одговор",
  invited: "Поканет",
  confirmed: "Доаѓа",
  declined: "Не доаѓа",
  later: "Ќе одговори подоцна",
};

type AuditRow = { id: number | string; occurred_at: string; action: string; event_id: string | null; details: Record<string, unknown> | null };

function detailFor(row: AuditRow): string | null {
  const d = row.details ?? {};
  if (row.action === "public_rsvp" && typeof d.new_status === "string") {
    const before = typeof d.previous_status === "string" ? RSVP_LABELS[d.previous_status] ?? d.previous_status : null;
    const after = RSVP_LABELS[d.new_status] ?? d.new_status;
    return before ? `${before} → ${after}` : after;
  }
  if (row.action === "event_deleted" && typeof d.event_date === "string") return d.event_date;
  return null;
}

export async function listVenueNotifications(client: SupabaseClient, venueId: string, limit = 50): Promise<VenueNotification[]> {
  const [audit, events] = await Promise.all([
    client
      .from("audit_log")
      .select("id, occurred_at, action, event_id, details")
      .eq("venue_id", venueId)
      .in("action", Object.keys(ACTIONS))
      .order("occurred_at", { ascending: false })
      .limit(limit),
    client
      .from("events")
      .select("id, couple_names, event_date, created_at")
      .eq("venue_id", venueId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (audit.error) throw audit.error;
  if (events.error) throw events.error;

  const names = new Map((events.data ?? []).map((e) => [e.id, e.couple_names as string]));
  const missing = Array.from(new Set((audit.data ?? []).map((r) => r.event_id).filter((id): id is string => !!id && !names.has(id))));
  if (missing.length) {
    const { data } = await client.from("events").select("id, couple_names").in("id", missing);
    for (const e of data ?? []) names.set(e.id, e.couple_names);
  }

  const fromAudit: VenueNotification[] = ((audit.data ?? []) as AuditRow[]).map((row) => {
    const meta = ACTIONS[row.action];
    const name = row.event_id ? names.get(row.event_id) : undefined;
    return {
      id: `a${row.id}`,
      at: row.occurred_at,
      kind: meta.kind,
      eventId: row.event_id,
      title: name ? `${meta.title}: ${name}` : meta.title,
      detail: detailFor(row),
    };
  });
  const fromEvents: VenueNotification[] = (events.data ?? []).map((e) => ({
    id: `e${e.id}`,
    at: e.created_at,
    kind: "event_created",
    eventId: e.id,
    title: `Нов настан: ${e.couple_names}`,
    detail: e.event_date,
  }));

  return [...fromAudit, ...fromEvents].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
