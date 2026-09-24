import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listRoomsWithSeatTotals } from "@/lib/venue/rooms";
import { listEventsWithDetails } from "@/lib/venue/events";
import { WeekCalendarClient } from "@/components/venue/dashboard/WeekCalendarClient";

// Matches the dashboard's fix for the same stale-Router-Cache class of bug —
// staff switching weeks/filters expects fresh data on every visit.
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);

  const [rooms, events] = await Promise.all([
    listRoomsWithSeatTotals(venueId!, supabase),
    listEventsWithDetails(venueId!, supabase),
  ]);

  const totalCapacity = rooms.reduce((sum, r) => sum + r.seatTotal, 0);

  return <WeekCalendarClient rooms={rooms} events={events} totalCapacity={totalCapacity} />;
}
