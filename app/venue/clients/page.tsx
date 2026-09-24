import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listEventsWithDetails } from "@/lib/venue/events";
import { listRooms } from "@/lib/venue/rooms";
import { listMenuTemplatesWithItems } from "@/lib/venue/menus";
import { ClientsClient } from "@/components/venue/dashboard/ClientsClient";

// Same stale-Router-Cache fix as /venue/reservations.
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);

  const [events, rooms, menuTemplates] = await Promise.all([
    listEventsWithDetails(venueId!, supabase),
    listRooms(venueId!, supabase),
    listMenuTemplatesWithItems(venueId!, supabase),
  ]);

  return (
    <ClientsClient venueId={venueId!} initialEvents={events} rooms={rooms} menuTemplates={menuTemplates} />
  );
}
