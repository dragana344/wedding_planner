import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listRoomsWithSeatTotals, listTableTypes } from "@/lib/venue/rooms";
import { listMenuTemplatesWithItemCounts } from "@/lib/venue/menus";
import { listEventsWithDetails } from "@/lib/venue/events";
import { listReservationsForDate } from "@/lib/venue/reservations";
import { listFixedElements, listRoomLayoutElements } from "@/lib/venue/floorplan";
import { peakConcurrentGuests } from "@/lib/venue/occupancy";
import { DashboardClient, type RoomLayout } from "@/components/venue/dashboard/DashboardClient";

// This page has no client-side refetch mechanism of its own — every stat,
// list, and calendar dot is computed server-side on each render. Without
// this, Next.js's client Router Cache can serve a stale snapshot when
// staff navigate back to the dashboard (e.g. after creating an event on
// another page), showing yesterday's data until a hard reload. Forcing
// this route dynamic makes every visit re-render fresh, matching the fix
// already applied to the Room floor-plan page for the same underlying issue.
export const dynamic = "force-dynamic";

const MK_MONTHS = [
  "Јануари", "Февруари", "Март", "Април", "Мај", "Јуни",
  "Јули", "Август", "Септември", "Октомври", "Ноември", "Декември",
];

function isoOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Today's calendar date in Macedonia, regardless of what timezone the server
 * process itself runs in (e.g. a host defaulting to UTC). Without this, a
 * server clock even a couple of hours off from Europe/Skopje can disagree
 * with the venue's own "today" right around local midnight — an event
 * dated "today" wouldn't count in these stats until the server's clock
 * caught up. The rest of this page only ever reads calendar-day components
 * (year/month/date) off `now`, never the real instant, so a Date built from
 * Skopje's wall-clock date stays internally consistent for all of it.
 */
function skopjeToday(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Skopje",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(Number(map.year), Number(map.month) - 1, Number(map.day));
}

export default async function VenueHomePage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);

  const now = skopjeToday();
  const today = isoOf(now);

  const [rooms, menuTemplates, allEvents, todayReservations] = await Promise.all([
    listRoomsWithSeatTotals(venueId!, supabase),
    listMenuTemplatesWithItemCounts(venueId!, supabase),
    listEventsWithDetails(venueId!, supabase),
    listReservationsForDate(venueId!, today, supabase),
  ]);

  const todayEvents = allEvents.filter((e) => e.event_date === today);
  const upcomingEvents = allEvents
    .filter((e) => e.event_date > today && e.status !== "cancelled")
    .slice(0, 4);

  // Monday-first week containing today.
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekCounts = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const iso = isoOf(d);
    return { iso, count: allEvents.filter((e) => e.event_date === iso).length };
  });

  // Event counts per day-of-month, for the mini calendar dots — this month
  // and next, shown side by side since each grid is compact on its own.
  function eventDaysForMonthPrefix(prefix: string): Record<number, number> {
    const days: Record<number, number> = {};
    for (const e of allEvents) {
      if (e.event_date.startsWith(prefix)) {
        const day = Number(e.event_date.slice(8, 10));
        days[day] = (days[day] ?? 0) + 1;
      }
    }
    return days;
  }
  const monthPrefix = today.slice(0, 7);
  const monthEventDays = eventDaysForMonthPrefix(monthPrefix);

  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthPrefix = isoOf(nextMonthDate).slice(0, 7);
  const nextMonthEventDays = eventDaysForMonthPrefix(nextMonthPrefix);

  const totalCapacity = rooms.reduce((sum, r) => sum + r.seatTotal, 0);

  // Per-room floor-plan data for the dashboard's mini "Распоред на маси"
  // visualization — fetched for every room up front (venues have few rooms)
  // rather than refetched client-side each time the room tab switches.
  const roomLayouts: Record<string, RoomLayout> = Object.fromEntries(
    await Promise.all(
      rooms.map(async (room) => {
        const [fixedElements, layoutElements, tableTypes] = await Promise.all([
          listFixedElements(room.id, supabase),
          listRoomLayoutElements(room.id, supabase),
          listTableTypes(room.id, supabase),
        ]);
        return [room.id, { fixedElements, layoutElements, tableTypes }];
      })
    )
  );

  return (
    <DashboardClient
      today={today}
      rooms={rooms}
      roomLayouts={roomLayouts}
      menuTemplates={menuTemplates}
      todayEvents={todayEvents}
      todayReservations={todayReservations}
      upcomingEvents={upcomingEvents}
      weekCounts={weekCounts}
      monthEventDays={monthEventDays}
      monthLabel={`${MK_MONTHS[now.getMonth()]} ${now.getFullYear()}`}
      nextMonthEventDays={nextMonthEventDays}
      nextMonthLabel={`${MK_MONTHS[nextMonthDate.getMonth()]} ${nextMonthDate.getFullYear()}`}
      stats={{
        todayCount: todayEvents.length,
        todayGuests: todayEvents.reduce((s, e) => s + (e.guest_count_estimate ?? 0), 0),
        // Occupancy compares seats against the busiest moment, not the day's
        // total footfall — sequential events reuse the same seats.
        peakGuests: peakConcurrentGuests(todayEvents),
        inPreparation: todayEvents.filter((e) => e.status === "preparation").length,
        completedToday: todayEvents.filter((e) => e.status === "completed").length,
        upcomingCount: allEvents.filter((e) => e.event_date > today).length,
        totalCapacity,
      }}
    />
  );
}
