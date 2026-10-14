import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listVenueSupportTickets } from "@/lib/venue/support";
import { SupportTicketPanel } from "@/components/support/SupportTicketPanel";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  const tickets = venueId ? await listVenueSupportTickets(venueId) : [];

  // No venue: the layout decides (none → /login, blocked → BlockedScreen).
  if (!venueId) return null;

  return (
    <div className="wrap">
      <SupportTicketPanel endpoint="/api/venue/support" initialTickets={tickets} />
    </div>
  );
}
