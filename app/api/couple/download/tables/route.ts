import { withCoupleEvent } from "@/lib/api/handler";
import { getBudgetSummary } from "@/lib/couple/budget";
import { guestsToCsv } from "@/lib/couple/guest-csv";
import { getEventMenuNames, listGuests } from "@/lib/couple/guests";
import { budgetCsv } from "@/lib/couple/keepsake/csv";
import { attachmentDisposition, safeFileName, uniqueFileNames } from "@/lib/couple/keepsake/names";
import { toKeepsakeBudget } from "@/lib/couple/keepsake/types";
import { seatingCsv } from "@/lib/seating/csv";
import { readRoom } from "@/lib/seating/read";
import { zipStream, type ZipEntry } from "@/lib/media/zip";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Group A task 7: "Табели" — the guest list, the budget and the seating per
// hall as CSV files for Excel, in one ZIP. GET only, no `feature` (see
// ../book/route.ts). Small text files, so they are built in memory.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RoomRow = { id: string; name: string };

function textEntry(name: string, text: string): ZipEntry {
  const bytes = new TextEncoder().encode(text);
  return {
    name,
    size: bytes.length,
    open: async () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
  };
}

export const GET = withCoupleEvent(
  async ({ eventId }) => {
    const client = createServiceRoleClient();
    const { data: event, error } = await client
      .from("events")
      .select("couple_names, seating_mode, event_rooms(rooms(id, name))")
      .eq("id", eventId)
      .single();
    if (error) throw error;
    const rooms = ((event.event_rooms ?? []) as unknown as { rooms: RoomRow | RoomRow[] | null }[])
      .map((r) => (Array.isArray(r.rooms) ? r.rooms[0] : r.rooms))
      .filter((r): r is RoomRow => Boolean(r))
      .sort((a, b) => a.name.localeCompare(b.name, "mk"));

    const [guests, menus, budget, seating] = await Promise.all([
      listGuests(eventId),
      getEventMenuNames(eventId),
      getBudgetSummary(eventId),
      // A mini event has no seating plan of its own (Project B §3).
      event.seating_mode === "mini" ? Promise.resolve([]) : Promise.all(rooms.map(async (room) => ({ room, ...(await readRoom(client, eventId, room.id, "event_room_tables")) }))),
    ]);

    const seated = seating.filter((r) => r.seats.length > 0);
    const seatingNames = uniqueFileNames(seated.map((r) => (seated.length === 1 ? "Распоред на маси.csv" : `Распоред на маси — ${safeFileName(r.room.name, "сала")}.csv`)));
    const entries = [
      textEntry("Гости.csv", guestsToCsv(guests, menus)),
      textEntry("Буџет.csv", budgetCsv(toKeepsakeBudget(budget))),
      ...seated.map((r, i) => textEntry(seatingNames[i], seatingCsv(r.room.name, { tables: r.tables, seats: r.seats, guests: [] }))),
    ];
    return new Response(zipStream(entries), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": attachmentDisposition(`Табели — ${safeFileName(event.couple_names, "свадба")}.zip`, "tabeli.zip"),
        "cache-control": "no-store",
      },
    });
  },
  { fallbackError: "Не успеа подготвувањето на табелите." },
);
