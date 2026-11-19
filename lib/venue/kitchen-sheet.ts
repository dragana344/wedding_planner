import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listEventChanges } from "@/lib/changes/server";
import { describeChange, formatChangedAt } from "@/lib/changes/format";
import { formatVenueDatePadded } from "@/lib/date";
import { allergiesByTable, type KitchenAllergy, type KitchenAllergyTable } from "@/lib/kitchen-sheet";
import { sentHeadcount, sentMeals, sentMenus, toMenuSubmission, type MenuSubmission, type MenuSubmissionRow } from "@/lib/menu-numbers";
import { readRoom } from "@/lib/seating/read";
import { tableTitle } from "@/lib/seating/types";

// The venue's kitchen sheet (decision 10): what the latest sending says, by
// menu, the estimated part marked, allergies by table, and the couple's
// changes since that sending. Read with the signed-in staff client like the
// event window's "Бројки за мени" (any staff of the venue); only the change
// log is read with the service role, as the event window's changes route does.

export type KitchenSheetData = {
  title: string;
  date: string;
  start: string | null;
  halls: string[];
  generatedAt: string;
  latest: MenuSubmission | null;
  menus: { id: string; name: string; count: number; estimated: number }[];
  meals: number;
  estimated: number;
  noMeal: number;
  headcount: number;
  allergySummary: string | null;
  allergyTables: KitchenAllergyTable[];
  allergyUnseated: KitchenAllergy[];
  /** "numbers" marks after the latest sending, oldest first: "03.12.2026 14:05 · +2 Месо". */
  changes: { id: string; text: string }[];
};

const SUBMISSION_COLUMNS =
  "id, sent_at, sent_by, counts, menu_titles, total, seen_at, seen_by, source, unanswered, allergy_summary, allergy_notes, no_meal_count, estimated_counts, estimated_total";

/** `client` is the staff client of a venue that owns the event (checked by the caller). */
export async function kitchenSheetData(client: SupabaseClient, eventId: string, now = new Date()): Promise<KitchenSheetData> {
  const [{ data: event, error }, { data: subs, error: subsError }] = await Promise.all([
    client.from("events").select("couple_names, event_date, start_time, event_rooms(room_id, rooms(id, name))").eq("id", eventId).single(),
    client
      .from("event_menu_submissions")
      .select(SUBMISSION_COLUMNS)
      .eq("event_id", eventId)
      .order("sent_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
  ]);
  if (error) throw error;
  if (subsError) throw subsError;
  const latest = (subs ?? []).length > 0 ? toMenuSubmission((subs as unknown as MenuSubmissionRow[])[0]) : null;

  type RoomRow = { id: string; name: string };
  const rooms = (event.event_rooms as unknown as { rooms: RoomRow | RoomRow[] | null }[])
    .map((er) => (Array.isArray(er.rooms) ? er.rooms[0] : er.rooms))
    .filter((r): r is RoomRow => Boolean(r))
    .sort((a, b) => a.name.localeCompare(b.name, "mk"));

  // Where each guest sits (staff seat readers, as on the plan), only needed when there are raw notes to place.
  const tablesOf = new Map<string, string[]>();
  const tableOrder: string[] = [];
  if (latest?.allergyNotes?.length) {
    const multiRoom = rooms.length > 1;
    for (const room of rooms) {
      const { tables, seats } = await readRoom(client, eventId, room.id, "event_room_tables_for_staff");
      const titleOf = new Map(tables.map((t) => [t.elementId, multiRoom ? `${tableTitle(t)} (${room.name})` : tableTitle(t)]));
      for (const t of tables) tableOrder.push(titleOf.get(t.elementId)!);
      for (const s of seats) {
        const title = s.guestId ? titleOf.get(s.elementId) : undefined;
        if (!s.guestId || !title) continue;
        const list = tablesOf.get(s.guestId) ?? [];
        if (!list.includes(title)) list.push(title);
        tablesOf.set(s.guestId, list);
      }
    }
  }
  const allergies = allergiesByTable(latest?.allergyNotes ?? [], tablesOf, tableOrder);

  const changes = latest
    ? (await listEventChanges(eventId, latest.sentAt))
        .filter((c) => c.side === "couple" && c.section === "numbers")
        .map((c) => ({ id: c.id, text: `${formatChangedAt(c.changedAt)} · ${describeChange(c, { redactPrivate: true })}` }))
    : [];

  return {
    title: event.couple_names as string,
    date: formatVenueDatePadded(`${event.event_date as string}T12:00:00Z`),
    start: ((event.start_time as string | null) ?? null)?.slice(0, 5) ?? null,
    halls: rooms.map((r) => r.name),
    generatedAt: formatChangedAt(now.toISOString()),
    latest,
    menus: latest ? sentMenus(latest) : [],
    meals: latest ? sentMeals(latest) : 0,
    estimated: latest?.estimate?.total ?? 0,
    noMeal: latest?.numbers.noMeal ?? 0,
    headcount: latest ? sentHeadcount(latest) : 0,
    allergySummary: latest?.allergySummary ?? null,
    allergyTables: allergies.tables,
    allergyUnseated: allergies.unseated,
    changes,
  };
}
