import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listReservations } from "@/lib/venue/reservations";
import { listRoomsWithSeatTotals } from "@/lib/venue/rooms";
import { ReservationsClient } from "@/components/venue/dashboard/ReservationsClient";

// Without this, Next.js's client Router Cache can serve a stale snapshot of
// this page (e.g. from right after a reset, when the list was empty) when
// staff navigate back via the sidebar — making live changes look like they
// vanished. Same fix already applied to /venue and /venue/calendar.
export const dynamic = "force-dynamic";

export default async function ReservationsPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;
  const [reservations, rooms] = await Promise.all([
    listReservations(venueId, supabase),
    listRoomsWithSeatTotals(venueId, supabase),
  ]);
  return <ReservationsClient venueId={venueId} initialReservations={reservations} rooms={rooms} />;
}
