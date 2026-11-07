import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { listEventLayoutElements, listFixedElements, type EventLayoutElement } from "@/lib/venue/floorplan";
import { listTableTypes } from "@/lib/venue/rooms";
import { venueLogoUrl } from "@/lib/venue/venue-profile";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";
import { eventHasFeature } from "@/lib/entitlements/server";
import { buildPrintRoom, type PrintRoom } from "./print";
import { readRoom } from "./read";
import { qrSvg, tableQrTarget } from "./qr";
import { tableTitle, type SeatTable } from "./types";
import type { QrCard } from "@/components/seating/print/TableQrCards";

// What the print pages (B7) show. The venue prints the confirmed layout staff
// see; the couple prints their own draft.

export interface PrintData {
  title: string;
  subtitle: string;
  logoUrl: string | null;
  rooms: PrintRoom[];
  cards: QrCard[];
  qrTarget: string;
  /** The event's plan has no "Печатење QR кодови" (print_qr): no cards. The plan itself stays printable. */
  qrLocked: boolean;
}

const DATE = new Intl.DateTimeFormat("mk-MK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

function formatDate(iso: string): string {
  return DATE.format(new Date(`${iso}T00:00:00Z`)).replace(/\s*г\.?$/, "");
}

type Loader = (roomId: string) => Promise<{ layout: EventLayoutElement[]; tables: SeatTable[] }>;

/**
 * Project C: per-table menu breakdown, but only where it's genuinely mixed
 * — a table everyone shares one menu needs no note. event_guest_menu_counts
 * is per guest *party*, not per seat, so a party's breakdown is counted once
 * per table it actually sits at, never once per seat it holds there.
 */
async function tableMenuNotes(service: SupabaseClient, eventId: string, roomId: string): Promise<Map<string, string>> {
  const { data: seats, error } = await service
    .from("event_seat_assignments")
    .select("layout_element_id, guest_id")
    .eq("event_id", eventId)
    .eq("room_id", roomId)
    .not("guest_id", "is", null);
  if (error) throw error;
  const rows = (seats ?? []) as { layout_element_id: string; guest_id: string }[];
  if (rows.length === 0) return new Map();

  const tableGuests = new Map<string, Set<string>>();
  for (const s of rows) {
    const set = tableGuests.get(s.layout_element_id) ?? new Set<string>();
    set.add(s.guest_id);
    tableGuests.set(s.layout_element_id, set);
  }

  const guestIds = [...new Set(rows.map((s) => s.guest_id))];
  const { data: counts, error: countsError } = await service
    .from("event_guest_menu_counts")
    .select("guest_id, count, menu_templates(name)")
    .in("guest_id", guestIds);
  if (countsError) throw countsError;

  const byGuest = new Map<string, { name: string; count: number }[]>();
  for (const row of counts ?? []) {
    const tpl = row.menu_templates as { name: string } | { name: string }[] | null;
    const name = Array.isArray(tpl) ? tpl[0]?.name : tpl?.name;
    if (!name) continue;
    const list = byGuest.get(row.guest_id as string) ?? [];
    list.push({ name, count: row.count as number });
    byGuest.set(row.guest_id as string, list);
  }

  const notes = new Map<string, string>();
  for (const [tableId, guestSet] of tableGuests) {
    const totals = new Map<string, number>();
    for (const guestId of guestSet) {
      for (const m of byGuest.get(guestId) ?? []) totals.set(m.name, (totals.get(m.name) ?? 0) + m.count);
    }
    if (totals.size < 2) continue;
    notes.set(tableId, [...totals.entries()].map(([name, count]) => `${name} ${count}`).join(", "));
  }
  return notes;
}

async function build(client: SupabaseClient, eventId: string, origin: string, load: Loader): Promise<PrintData> {
  const service = createServiceRoleClient();
  const { data: event, error } = await client
    .from("events")
    .select("couple_names, event_date, venue_id, event_rooms(room_id, rooms(id, name, width_cm, height_cm))")
    .eq("id", eventId)
    .single();
  if (error) throw error;
  // The venue row and the invitation are read with the service role: the
  // caller has already been authorised for this event (staff or couple).
  const [{ data: venue, error: venueError }, { data: invitation }] = await Promise.all([
    service.from("venues").select("name, logo_path").eq("id", event.venue_id).single(),
    service.from("event_invitations").select("public_slug").eq("event_id", eventId).maybeSingle(),
  ]);
  if (venueError) throw venueError;

  type RoomRow = { id: string; name: string; width_cm: number; height_cm: number };
  const rooms = (event.event_rooms as unknown as { rooms: RoomRow | RoomRow[] | null }[])
    .map((er) => (Array.isArray(er.rooms) ? er.rooms[0] : er.rooms))
    .filter((r): r is RoomRow => Boolean(r))
    .sort((a, b) => a.name.localeCompare(b.name, "mk"));

  const qrTarget = tableQrTarget(origin, invitation?.public_slug ?? null);
  const qrLocked = !(await eventHasFeature(eventId, "print_qr"));
  const qr = qrLocked ? "" : await qrSvg(qrTarget);
  const printRooms: PrintRoom[] = [];
  const cards: QrCard[] = [];
  for (const room of rooms) {
    const [{ layout, tables }, fixed, tableTypes, menuNotes] = await Promise.all([
      load(room.id),
      listFixedElements(room.id, client),
      listTableTypes(room.id, client),
      tableMenuNotes(service, eventId, room.id),
    ]);
    printRooms.push(buildPrintRoom(room, layout, fixed, tables, tableTypes, menuNotes));
    const present = new Set(layout.map((el) => el.id));
    for (const t of [...tables].sort((a, b) => a.number - b.number)) {
      if (!qrLocked && present.has(t.elementId)) cards.push({ id: t.elementId, title: tableTitle(t), room: room.name, svg: qr });
    }
  }

  return {
    title: event.couple_names,
    subtitle: `${formatDate(event.event_date)} · ${venue.name}`,
    logoUrl: venueLogoUrl(service, venue.logo_path),
    rooms: printRooms,
    cards,
    qrTarget,
    qrLocked,
  };
}

/** Staff: `client` is the signed-in staff client (RLS); the event must be theirs. */
export function venuePrintData(client: SupabaseClient, eventId: string, origin: string): Promise<PrintData> {
  return build(client, eventId, origin, async (roomId) => ({
    layout: await listEventLayoutElements(eventId, roomId, client),
    tables: (await readRoom(client, eventId, roomId, "event_room_tables_for_staff")).tables,
  }));
}

/** Couple: their event from the session; service role throughout. */
export function couplePrintData(eventId: string, origin: string): Promise<PrintData> {
  const client = createServiceRoleClient();
  const actions = coupleSeatingActionsFor(eventId);
  return build(client, eventId, origin, async (roomId) => ({
    layout: await actions.listLayoutElements(eventId, roomId),
    tables: (await readRoom(client, eventId, roomId, "event_room_tables")).tables,
  }));
}
