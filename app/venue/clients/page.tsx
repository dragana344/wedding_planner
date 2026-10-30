import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { ClientsClient } from "@/components/venue/dashboard/ClientsClient";

// Same stale-Router-Cache fix as /venue/reservations.
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;

  // Client contact info is manager/owner only (B?) — ClientsClient fetches it
  // itself from /api/venue/clients with the elevation token, so an
  // unelevated session is never sent the data in the first place.
  return <ClientsClient />;
}
