import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getVenueFeatures } from "@/lib/entitlements/server";
import { listRooms } from "@/lib/venue/rooms";
import { ReportsClient } from "@/components/venue/dashboard/ReportsClient";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; room?: string }>;
}) {
  const params = await searchParams;
  // No date filter by default — every event, not just the current year
  // (which silently hid events outside it, e.g. ones dated next year, with
  // no indication why the report looked empty). The filter form below still
  // lets a venue narrow it down to a specific range.
  const from = params.from && ISO.test(params.from) ? params.from : undefined;
  const to = params.to && ISO.test(params.to) ? params.to : undefined;

  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;
  // Check on the server before reading any data. A locked section's content
  // is shown readable (no blur since group A task 2), and reports are
  // computed, not data the venue entered: nothing to show but the panel
  // shell's LockedBanner.
  if (!(await getVenueFeatures(venueId)).reports.enabled) return null;
  const rooms = await listRooms(venueId, supabase);
  const roomId = rooms.some((r) => r.id === params.room) ? params.room : undefined;

  return <ReportsClient rooms={rooms.map((r) => ({ id: r.id, name: r.name }))} filters={{ from, to, roomId }} />;
}
