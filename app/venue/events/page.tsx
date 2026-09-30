import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listEventsWithDetails } from "@/lib/venue/events";
import { listRooms } from "@/lib/venue/rooms";
import { listMenuTemplatesWithItems } from "@/lib/venue/menus";
import { EventsClient } from "@/components/venue/dashboard/EventsClient";

// Same stale-Router-Cache fix as /venue/reservations.
export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; event?: string }>;
}) {
  const { filter, event } = await searchParams;
  const initialFilter =
    filter === "upcoming" || filter === "today" || filter === "week" ||
    filter === "month" || filter === "done"
      ? filter
      : "all";

  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;

  const [events, rooms, menuTemplates] = await Promise.all([
    listEventsWithDetails(venueId, supabase),
    listRooms(venueId, supabase),
    listMenuTemplatesWithItems(venueId, supabase),
  ]);

  return (
    <EventsClient
      venueId={venueId}
      initialEvents={events}
      rooms={rooms}
      menuTemplates={menuTemplates}
      initialFilter={initialFilter}
      initialEventId={event}
    />
  );
}
