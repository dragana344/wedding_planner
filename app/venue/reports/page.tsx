import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getVenueFeatures } from "@/lib/entitlements/server";
import { getReport } from "@/lib/venue/reports";
import { listRooms } from "@/lib/venue/rooms";
import { todayIn } from "@/lib/date";
import { ReportsClient } from "@/components/venue/dashboard/ReportsClient";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; room?: string }>;
}) {
  const params = await searchParams;
  const year = todayIn().slice(0, 4);
  const from = params.from && ISO.test(params.from) ? params.from : `${year}-01-01`;
  const to = params.to && ISO.test(params.to) ? params.to : `${year}-12-31`;

  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;
  // A locked section still renders its page (D7): check on the server before
  // reading any data. The panel shell already shows the LockedBanner here.
  if (!(await getVenueFeatures(venueId)).reports.enabled) return null;
  const rooms = await listRooms(venueId, supabase);
  const roomId = rooms.some((r) => r.id === params.room) ? params.room : undefined;
  const report = await getReport(supabase, venueId, { from, to, roomId });

  return <ReportsClient report={report} rooms={rooms.map((r) => ({ id: r.id, name: r.name }))} filters={{ from, to, roomId }} />;
}
