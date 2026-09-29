import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { recordAudit } from "@/lib/audit";

// DATA-005: export every personal-data table for a venue account or a single
// event (docs/production/DATA-MAP.md). Never exported: credentials and
// session secrets (event_credentials.password_hash, couple_sessions,
// venues.layout_lock_password_hash) and contact_submissions (not venue data).

/**
 * Public tables whose rows reach the export, per subject. The privacy guard
 * test (tests/supabase/privacy_guard.test.ts) checks that every table holding
 * a personal column is listed here or deliberately excluded.
 */
export const EXPORTED_TABLES = [
  "venues",
  "venue_staff",
  "reservations",
  "events",
  "event_credentials",
  "event_guests",
  "event_notes",
  "event_agenda_items",
  "event_locations",
  "event_budget_items",
  "event_checklist_items",
  "event_checklist_subtasks",
  "event_invitations",
  "event_custom_menu_items",
  "event_menu_item_quantities",
  "event_showcase_photos",
  "event_layout_elements",
] as const;

const PAGE = 1000;
const ID_CHUNK = 100;

type Row = Record<string, unknown>;

export type EventExport = {
  event: Row;
  couple_login: { username: string; created_at: string } | null;
  guests: Row[];
  notes: Row[];
  agenda: Row[];
  locations: Row[];
  budget: Row[];
  checklist: (Row & { subtasks: Row[] })[];
  invitation: (Row & { photo_url: string | null }) | null;
  custom_menu_items: Row[];
  menu_item_quantities: Row[];
  showcase_photos: (Row & { photo_url: string })[];
  seating_labels: Row[];
};

export type VenueExport = {
  exported_at: string;
  venue: Row;
  staff: { user_id: string; email: string | null; created_at: string | null; last_sign_in_at: string | null }[];
  reservations: Row[];
  events: EventExport[];
};

export type ExportActor = { actorId?: string | null; requestId?: string | null };

// Explicit column lists for the tables that also hold data we must not hand
// out (secrets) or that is bulky and not personal (layout JSON).
const EVENT_COLUMNS =
  "id, venue_id, couple_names, event_date, start_time, end_time, event_type, status, guest_count_estimate, " +
  "contact_email, contact_email_2, contact_phone, total_price, deposit_paid, menu_template_id, created_at, personal_data_erased_at";
const VENUE_COLUMNS = "id, name, created_at";

/** A guest row minus its personal invite token (the link opens that guest's RSVP). */
function withoutInviteToken(guest: Row): Row {
  const copy = { ...guest };
  delete copy.invite_token;
  return copy;
}

/** Every row of `table` whose `column` is in `ids`, paged past PostgREST's row cap. */
async function selectIn(
  client: SupabaseClient,
  table: string,
  columns: string,
  column: string,
  ids: string[],
  orderBy: string[],
): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE) {
      let query = client.from(table).select(columns).in(column, chunk);
      for (const col of orderBy) query = query.order(col);
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Row[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
  }
  return out;
}

function groupBy(rows: Row[], key: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const row of rows) {
    const k = String(row[key]);
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return map;
}

function publicUrl(client: SupabaseClient, bucket: string, path: unknown): string | null {
  if (typeof path !== "string" || !path) return null;
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

async function exportEvents(client: SupabaseClient, events: Row[]): Promise<EventExport[]> {
  const ids = events.map((e) => String(e.id));
  if (ids.length === 0) return [];
  const byEvent = "event_id";

  const [credentials, guests, notes, agenda, locations, budget, checklist, invitations, customMenu, quantities, showcase, layout] =
    await Promise.all([
      selectIn(client, "event_credentials", "event_id, username, created_at", byEvent, ids, [byEvent]),
      selectIn(client, "event_guests", "*", byEvent, ids, ["created_at", "id"]).then((rows) => rows.map(withoutInviteToken)),
      selectIn(client, "event_notes", "*", byEvent, ids, ["created_at", "id"]),
      selectIn(client, "event_agenda_items", "*", byEvent, ids, ["sort_order", "id"]),
      selectIn(client, "event_locations", "*", byEvent, ids, ["sort_order", "id"]),
      selectIn(client, "event_budget_items", "*", byEvent, ids, ["created_at", "id"]),
      selectIn(client, "event_checklist_items", "*", byEvent, ids, ["created_at", "id"]),
      selectIn(client, "event_invitations", "*", byEvent, ids, [byEvent]),
      selectIn(client, "event_custom_menu_items", "event_id, menu_item_id, menu_items(name)", byEvent, ids, [byEvent, "menu_item_id"]),
      selectIn(client, "event_menu_item_quantities", "event_id, menu_item_id, guest_count, menu_items(name)", byEvent, ids, [byEvent, "menu_item_id"]),
      selectIn(client, "event_showcase_photos", "*", byEvent, ids, ["created_at", "id"]),
      selectIn(client, "event_layout_elements", "id, event_id, room_id, element_type, label", byEvent, ids, ["id"]),
    ]);

  const subtasks = await selectIn(
    client,
    "event_checklist_subtasks",
    "*",
    "checklist_item_id",
    checklist.map((c) => String(c.id)),
    ["created_at", "id"],
  );
  const subtasksByItem = groupBy(subtasks, "checklist_item_id");

  const g = {
    credentials: groupBy(credentials, byEvent),
    guests: groupBy(guests, byEvent),
    notes: groupBy(notes, byEvent),
    agenda: groupBy(agenda, byEvent),
    locations: groupBy(locations, byEvent),
    budget: groupBy(budget, byEvent),
    checklist: groupBy(checklist, byEvent),
    invitations: groupBy(invitations, byEvent),
    customMenu: groupBy(customMenu, byEvent),
    quantities: groupBy(quantities, byEvent),
    showcase: groupBy(showcase, byEvent),
    labels: groupBy(layout.filter((r) => r.label), byEvent),
  };

  return events.map((event) => {
    const id = String(event.id);
    const cred = g.credentials.get(id)?.[0];
    const invitation = g.invitations.get(id)?.[0];
    return {
      event,
      couple_login: cred ? { username: String(cred.username), created_at: String(cred.created_at) } : null,
      guests: g.guests.get(id) ?? [],
      notes: g.notes.get(id) ?? [],
      agenda: g.agenda.get(id) ?? [],
      locations: g.locations.get(id) ?? [],
      budget: g.budget.get(id) ?? [],
      checklist: (g.checklist.get(id) ?? []).map((item) => ({ ...item, subtasks: subtasksByItem.get(String(item.id)) ?? [] })),
      invitation: invitation ? { ...invitation, photo_url: publicUrl(client, "invitation-photos", invitation.photo_path) } : null,
      custom_menu_items: g.customMenu.get(id) ?? [],
      menu_item_quantities: g.quantities.get(id) ?? [],
      showcase_photos: (g.showcase.get(id) ?? []).map((p) => ({
        ...p,
        photo_url: publicUrl(client, "event-showcase-photos", p.photo_path) ?? "",
      })),
      seating_labels: g.labels.get(id) ?? [],
    };
  });
}

/** Everything personal held for one event (couple, guests, planning tools). Null if the event does not exist. */
export async function exportEventData(eventId: string, actor: ExportActor = {}): Promise<EventExport | null> {
  const client = createServiceRoleClient();
  const { data: event, error } = await client.from("events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!event) return null;
  const [result] = await exportEvents(client, [event as unknown as Row]);
  await recordAudit({
    action: "privacy_export",
    actorType: actor.actorId ? "staff" : "system",
    actorId: actor.actorId,
    venueId: String((event as unknown as Row).venue_id),
    eventId,
    targetId: eventId,
    requestId: actor.requestId,
    details: { scope: "event" },
  });
  return result;
}

/** Everything personal held for a venue account: the venue, its staff logins, reservations and every event. */
export async function exportVenueData(venueId: string, actor: ExportActor = {}): Promise<VenueExport | null> {
  const client = createServiceRoleClient();
  const { data: venue, error } = await client.from("venues").select(VENUE_COLUMNS).eq("id", venueId).maybeSingle();
  if (error) throw error;
  if (!venue) return null;

  const [staffRows, reservations, events] = await Promise.all([
    selectIn(client, "venue_staff", "user_id", "venue_id", [venueId], ["user_id"]),
    selectIn(client, "reservations", "*, reservation_tables(layout_element_id)", "venue_id", [venueId], ["date", "id"]),
    selectIn(client, "events", EVENT_COLUMNS, "venue_id", [venueId], ["event_date", "id"]),
  ]);

  const staff = await Promise.all(
    staffRows.map(async (row) => {
      const userId = String(row.user_id);
      const { data } = await client.auth.admin.getUserById(userId);
      return {
        user_id: userId,
        email: data.user?.email ?? null,
        created_at: data.user?.created_at ?? null,
        last_sign_in_at: data.user?.last_sign_in_at ?? null,
      };
    }),
  );

  const result: VenueExport = {
    exported_at: new Date().toISOString(),
    venue: venue as unknown as Row,
    staff,
    reservations,
    events: await exportEvents(client, events),
  };

  await recordAudit({
    action: "privacy_export",
    actorType: actor.actorId ? "staff" : "system",
    actorId: actor.actorId,
    venueId,
    targetId: venueId,
    requestId: actor.requestId,
    details: { scope: "venue", events: events.length },
  });
  return result;
}
