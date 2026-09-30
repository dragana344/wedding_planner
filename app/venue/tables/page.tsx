import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listRoomsWithSeatTotals } from "@/lib/venue/rooms";
import { TablesClient } from "@/components/venue/dashboard/TablesClient";

// Same stale-Router-Cache fix as /venue/reservations.
export const dynamic = "force-dynamic";

export default async function TablesPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;
  const rooms = await listRoomsWithSeatTotals(venueId, supabase);

  return <TablesClient venueId={venueId} initialRooms={rooms} />;
}
