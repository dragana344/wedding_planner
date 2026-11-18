import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { listAgendaItems } from "@/lib/couple/agenda";
import { listLocations } from "@/lib/couple/locations";
import { getEventMenuNames, getGuestStats, listGuests } from "@/lib/couple/guests";
import { getInvitation, getInvitationPhotoUrl } from "@/lib/couple/invitations";
import { getEventMenus } from "@/lib/couple/menu";
import { listMenuSubmissions } from "@/lib/couple/menu-submissions";
import { getBudgetSummary } from "@/lib/couple/budget";
import { listChecklistItems } from "@/lib/couple/checklist";
import { listNotes, deriveNoteDisplay } from "@/lib/couple/notes";
import { listGreetings } from "@/lib/media/greetings";
import { readRoom } from "@/lib/seating/read";
import { tableTitle } from "@/lib/seating/types";
import { guestMenuText, toKeepsakeBudget, type KeepsakeData, type KeepsakeTable } from "./types";

// Gathers everything the wedding book and the spreadsheets show (group A
// task 7). Read with the service role: the route has already resolved the
// couple's event from the session. Co-organizers get the same as the couple:
// they see every guest, the budget and the rest in the panel too.

type RoomRow = { id: string; name: string };

/** The invitation photo for the PDF: JPEG and PNG only; anything else, or a failed fetch, is left out. */
async function invitationPhoto(photoPath: string | null): Promise<{ data: Buffer; format: "jpg" | "png" } | null> {
  const format = photoPath?.match(/\.(jpg|png)$/)?.[1] as "jpg" | "png" | undefined;
  const url = getInvitationPhotoUrl(photoPath);
  if (!format || !url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return { data: Buffer.from(await response.arrayBuffer()), format };
  } catch {
    return null;
  }
}

async function seatingTables(eventId: string, rooms: RoomRow[]): Promise<KeepsakeTable[]> {
  const client = createServiceRoleClient();
  const result: KeepsakeTable[] = [];
  for (const room of rooms) {
    const { tables, seats } = await readRoom(client, eventId, room.id, "event_room_tables");
    for (const table of tables) {
      const tableSeats = seats
        .filter((s) => s.elementId === table.elementId)
        .sort((a, b) => a.seatNumber - b.seatNumber)
        .map((s) => ({ number: s.seatNumber, name: s.displayName }));
      if (tableSeats.length > 0) result.push({ room: room.name, title: tableTitle(table), capacity: table.capacity, seats: tableSeats });
    }
  }
  return result;
}

export async function loadKeepsake(eventId: string): Promise<KeepsakeData> {
  const client = createServiceRoleClient();
  const { data: event, error } = await client
    .from("events")
    .select("couple_names, event_date, start_time, end_time, event_type, seating_mode, venue_id, event_rooms(rooms(id, name))")
    .eq("id", eventId)
    .single();
  if (error) throw error;
  const rooms = ((event.event_rooms ?? []) as unknown as { rooms: RoomRow | RoomRow[] | null }[])
    .map((r) => (Array.isArray(r.rooms) ? r.rooms[0] : r.rooms))
    .filter((r): r is RoomRow => Boolean(r))
    .sort((a, b) => a.name.localeCompare(b.name, "mk"));

  const [venue, invitation, agenda, locations, guests, menuNames, stats, menus, [latest = null], budget, checklist, notes, greetings, tables] =
    await Promise.all([
      client.from("venues").select("name").eq("id", event.venue_id).single(),
      getInvitation(eventId),
      listAgendaItems(eventId),
      listLocations(eventId),
      listGuests(eventId),
      getEventMenuNames(eventId),
      getGuestStats(eventId),
      getEventMenus(eventId),
      listMenuSubmissions(eventId, 1),
      getBudgetSummary(eventId),
      listChecklistItems(eventId),
      listNotes(eventId),
      // Hidden greetings stay out, like hidden photos in the album download.
      listGreetings(eventId),
      // A mini event has no seating plan of its own (Project B §3).
      event.seating_mode === "mini" ? Promise.resolve([]) : seatingTables(eventId, rooms),
    ]);

  const counts = new Map(stats.menus.map((m) => [m.id, m.count]));
  const confirmed = guests.filter((g) => g.rsvp_status === "confirmed");

  return {
    isWedding: event.event_type === "wedding",
    coupleNames: event.couple_names,
    eventDate: event.event_date,
    startTime: event.start_time,
    endTime: event.end_time,
    venueName: venue.data?.name ?? "",
    roomNames: rooms.map((r) => r.name),
    invitation: invitation
      ? { templateId: invitation.template_id, message: invitation.message, photo: await invitationPhoto(invitation.photo_path) }
      : null,
    agenda: agenda.map((a) => ({ time: a.time ? a.time.slice(0, 5) : null, title: a.title, location: a.location, notes: a.notes })),
    locations: locations.map((l) => ({ label: l.label, address: l.address, mapUrl: l.map_url })),
    guests: [...guests]
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "mk"))
      .map((g) => ({
        fullName: g.full_name,
        side: g.side,
        status: g.rsvp_status,
        partySize: g.party_size,
        childrenCount: g.children_count,
        menuText: guestMenuText(g, menuNames),
        allergies: g.allergies,
        comment: g.rsvp_comment,
      })),
    menus: menus.map((m) => ({ name: m.name, count: counts.get(m.id) ?? 0, dishes: m.dishes })),
    attending: { people: stats.totalAttending, children: stats.childrenAttending, parties: confirmed.length },
    numbersSentAt: latest?.sentAt ?? null,
    tables,
    greetings: greetings
      .map((g) => ({ name: `${g.firstName} ${g.lastName}`.trim(), message: g.message, hasVideo: g.videoUrl !== null, createdAt: g.createdAt }))
      .reverse(),
    budget: toKeepsakeBudget(budget),
    checklist: checklist.map((c) => ({
      title: c.title,
      dueDate: c.due_date,
      done: c.is_done,
      subtasks: c.subtasks.map((s) => ({ title: s.title, done: s.is_done })),
    })),
    notes: notes
      .filter((n) => n.content.trim() || n.title?.trim())
      .map((n) => ({
        title: deriveNoteDisplay(n.title, n.content).title,
        // Without its own title a note's first line is the title: not printed twice.
        content: n.title?.trim() ? n.content.trim() : n.content.trim().split("\n").slice(1).join("\n").trim(),
        updatedAt: n.updated_at,
      })),
  };
}
