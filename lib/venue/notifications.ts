import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describeChange } from "@/lib/changes/format";
import { SECTIONS_FOR_VIEWER, SECTION_LABELS } from "@/lib/changes/rules";
import type { ChangeSection } from "@/lib/changes/types";
import { todayIn } from "@/lib/date";
import { type NotificationColor, venueKindColor } from "@/lib/notification-colors";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// "Известувања" (B9): the venue's recent activity from the audit log (0042)
// plus newly created events, read with the staff client (RLS keeps it to the
// venue). The audit log never holds names, so couple names come from events.
// The couple's changes and menu numbers live in service-role-only tables, so
// they are read with the service-role client, scoped to this venue's events.

export type NotificationKind =
  | "event_created"
  | "credentials_created"
  | "password_regenerated"
  | "event_deleted"
  | "data_erased"
  | "data_exported"
  | "couple_change"
  | "menu_numbers";

/** What "Видено" on a notification confirms (manager only). */
export type SeenAction = {
  eventId: string;
  section: "guest_count" | "contact" | "menu_numbers";
  upTo: string;
  submissionId?: string;
};

export interface VenueNotification {
  id: string;
  at: string;
  kind: NotificationKind;
  eventId: string | null;
  title: string;
  detail: string | null;
  color: NotificationColor;
  unseen: boolean;
  seenAction?: SeenAction;
}

const ACTIONS: Record<string, { kind: NotificationKind; title: string }> = {
  couple_credentials_created: { kind: "credentials_created", title: "Креирана најава за парот" },
  couple_password_regenerated: { kind: "password_regenerated", title: "Нова лозинка за парот" },
  event_deleted: { kind: "event_deleted", title: "Избришан настан" },
  event_personal_data_erased: { kind: "data_erased", title: "Избришани лични податоци" },
  privacy_export: { kind: "data_exported", title: "Извоз на податоци" },
};

type AuditRow = { id: number | string; occurred_at: string; action: string; event_id: string | null; details: Record<string, unknown> | null };

function detailFor(row: AuditRow): string | null {
  const d = row.details ?? {};
  if (row.action === "event_deleted" && typeof d.event_date === "string") return d.event_date;
  return null;
}

export async function listVenueNotifications(
  client: SupabaseClient,
  venueId: string,
  limit = 50,
  range?: { from: string; to: string },
  color?: NotificationColor
): Promise<VenueNotification[]> {
  // The colour filter applies before the merge-sort-limit, so a colour shows
  // its own newest `limit` items, not the reds among the newest overall.
  const actions = Object.keys(ACTIONS).filter((a) => !color || venueKindColor(ACTIONS[a].kind) === color);
  const wantAudit = actions.length > 0;
  const wantEvents = !color || venueKindColor("event_created") === color;
  const wantCouple = !color || color === "yellow" || color === "green";
  const none = { data: [] as never[], error: null };
  let auditQuery = client
    .from("audit_log")
    .select("id, occurred_at, action, event_id, details")
    .eq("venue_id", venueId)
    .in("action", actions);
  let eventsQuery = client.from("events").select("id, couple_names, event_date, created_at").eq("venue_id", venueId);
  if (range) {
    auditQuery = auditQuery.gte("occurred_at", range.from).lte("occurred_at", range.to);
    eventsQuery = eventsQuery.gte("created_at", range.from).lte("created_at", range.to);
  }
  const [audit, events] = await Promise.all([
    wantAudit ? auditQuery.order("occurred_at", { ascending: false }).limit(limit) : Promise.resolve(none),
    wantEvents ? eventsQuery.order("created_at", { ascending: false }).limit(limit) : Promise.resolve(none),
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
      color: venueKindColor(meta.kind),
      unseen: false,
      eventId: row.event_id,
      title: name ? `${meta.title}: ${name}` : meta.title,
      detail: detailFor(row),
    };
  });
  const fromEvents: VenueNotification[] = (events.data ?? []).map((e) => ({
    id: `e${e.id}`,
    at: e.created_at,
    kind: "event_created",
    color: venueKindColor("event_created"),
    unseen: false,
    eventId: e.id,
    title: `Нов настан: ${e.couple_names}`,
    detail: e.event_date,
  }));

  const fromCouple = wantCouple
    ? await coupleNotifications(venueId, limit, range, color)
    : [];

  return [...fromAudit, ...fromEvents, ...fromCouple].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

type EventEmbed = { venue_id: string; couple_names: string; event_date: string };
type ChangeRow = { id: string; event_id: string; section: ChangeSection; side: "venue" | "couple"; changed_by: string | null; field: string; old_value: unknown; new_value: unknown; changed_at: string; events: EventEmbed };
type SubmissionRow = { id: string; event_id: string; sent_at: string; total: number; seen_at: string | null; source: "couple" | "auto" | "venue"; unanswered: number | null; events: EventEmbed };

/**
 * The couple's changes and menu numbers for the venue's own events
 * (service-role read). Each source is scoped to the venue by a join on
 * events, ranged and limited in SQL, so a big venue never sends its whole
 * event list in a URL. The venue side counts every couple change: the
 * couple's first login only gates the couple's own marks.
 */
async function coupleNotifications(venueId: string, limit: number, range?: { from: string; to: string }, color?: NotificationColor): Promise<VenueNotification[]> {
  const db = createServiceRoleClient();
  const today = todayIn();
  // Only load the lists of the wanted colour, so the limit counts just those.
  const wantChanges = !color || color === "yellow";
  const wantNumbers = !color || color === "green";
  const none = { data: [] as never[], error: null };

  let changesQuery = db
    .from("event_changes")
    .select("id, event_id, section, side, changed_by, field, old_value, new_value, changed_at, events!inner(venue_id, couple_names, event_date)")
    .eq("events.venue_id", venueId)
    .eq("side", "couple");
  let submissionsQuery = db
    .from("event_menu_submissions")
    .select("id, event_id, sent_at, total, seen_at, source, unanswered, events!inner(venue_id, couple_names, event_date)")
    .eq("events.venue_id", venueId)
    .neq("source", "venue");
  if (range) {
    changesQuery = changesQuery.gte("changed_at", range.from).lte("changed_at", range.to);
    submissionsQuery = submissionsQuery.gte("sent_at", range.from).lte("sent_at", range.to);
  }
  const [changes, submissions] = await Promise.all([
    wantChanges ? changesQuery.order("changed_at", { ascending: false }).limit(limit) : Promise.resolve(none),
    wantNumbers ? submissionsQuery.order("sent_at", { ascending: false }).limit(limit) : Promise.resolve(none),
  ]);
  if (changes.error) throw changes.error;
  if (submissions.error) throw submissions.error;
  const couple = (changes.data ?? []) as unknown as ChangeRow[];
  const subs = (submissions.data ?? []) as unknown as SubmissionRow[];

  // What the venue has seen, and each event's latest submission (any source:
  // a venue entry supersedes the couple's), only for the events listed above.
  const changeEvents = Array.from(new Set(couple.map((c) => c.event_id)));
  const subEvents = Array.from(new Set(subs.map((s) => s.event_id)));
  const [seenRows, latestRows] = await Promise.all([
    changeEvents.length
      ? db.from("event_change_seen").select("event_id, section, seen_up_to").in("event_id", changeEvents).eq("viewer", "venue")
      : Promise.resolve(none),
    subEvents.length
      ? db.from("event_menu_submissions").select("id, event_id").in("event_id", subEvents).order("sent_at", { ascending: false })
      : Promise.resolve(none),
  ]);
  if (seenRows.error) throw seenRows.error;
  if (latestRows.error) throw latestRows.error;

  const seen = new Map<string, string>();
  for (const r of (seenRows.data ?? []) as { event_id: string; section: string; seen_up_to: string }[]) seen.set(`${r.event_id}:${r.section}`, r.seen_up_to);
  // The newest listed couple change per event+section: what Видено confirms
  // (never past what this list shows, so nothing unshown gets hidden).
  const newest = new Map<string, string>();
  for (const c of couple) {
    const key = `${c.event_id}:${c.section}`;
    const cur = newest.get(key);
    if (!cur || Date.parse(c.changed_at) > Date.parse(cur)) newest.set(key, c.changed_at);
  }

  const out: VenueNotification[] = [];
  for (const c of couple) {
    const event = c.events;
    const key = `${c.event_id}:${c.section}`;
    const seenUpTo = seen.get(key);
    const tracked = (SECTIONS_FOR_VIEWER.venue as string[]).includes(c.section);
    const unseen = tracked && event.event_date >= today && (seenUpTo === undefined || Date.parse(c.changed_at) > Date.parse(seenUpTo));
    out.push({
      id: `c${c.id}`,
      at: c.changed_at,
      kind: "couple_change",
      color: venueKindColor("couple_change"),
      eventId: c.event_id,
      title: `${SECTION_LABELS[c.section]} · ${event.couple_names}`,
      detail: describeChange(
        { id: c.id, eventId: c.event_id, section: c.section, side: c.side, changedBy: c.changed_by, field: c.field, oldValue: c.old_value, newValue: c.new_value, changedAt: c.changed_at },
        { redactPrivate: true },
      ),
      unseen,
      ...(unseen ? { seenAction: { eventId: c.event_id, section: c.section as "guest_count" | "contact", upTo: newest.get(key)! } } : {}),
    });
  }

  const latest = new Map<string, string>();
  for (const s of (latestRows.data ?? []) as { id: string; event_id: string }[]) if (!latest.has(s.event_id)) latest.set(s.event_id, s.id);
  for (const s of subs) {
    const event = s.events;
    const unseen = latest.get(s.event_id) === s.id && s.seen_at === null && event.event_date >= today;
    const parts = [`Вкупно ${s.total}`];
    if (s.source === "auto") {
      parts.push("Испратено автоматски — непотполно");
      if (s.unanswered) parts.push(`${s.unanswered} гости без одговор`);
    }
    out.push({
      id: `m${s.id}`,
      at: s.sent_at,
      kind: "menu_numbers",
      color: venueKindColor("menu_numbers"),
      eventId: s.event_id,
      title: `Бројки за мени · ${event.couple_names}`,
      detail: parts.join(" · "),
      unseen,
      ...(unseen ? { seenAction: { eventId: s.event_id, section: "menu_numbers" as const, upTo: s.sent_at, submissionId: s.id } } : {}),
    });
  }

  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
