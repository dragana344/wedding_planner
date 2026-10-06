import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getVenueFeatures } from "@/lib/entitlements/server";
import { getReport, type ReportData } from "@/lib/venue/reports";
import { listRooms } from "@/lib/venue/rooms";
import { todayIn } from "@/lib/date";
import { ReportsClient } from "@/components/venue/dashboard/ReportsClient";

export const dynamic = "force-dynamic";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const SAMPLE_REPORT: ReportData = {
  totals: { events: 12, guests: 1480, revenue: 1250000, deposits: 380000 },
  byMonth: [
    { month: "2026-05", events: 3, guests: 380, revenue: 310000, deposits: 90000 },
    { month: "2026-06", events: 5, guests: 620, revenue: 540000, deposits: 170000 },
    { month: "2026-09", events: 4, guests: 480, revenue: 400000, deposits: 120000 },
  ],
  byRoom: [
    { roomId: "sample-1", roomName: "Сала 1", events: 8, seatCapacity: 180, avgFill: 0.82 },
    { roomId: "sample-2", roomName: "Сала 2", events: 4, seatCapacity: 80, avgFill: 0.9 },
  ],
  byType: [
    { type: "wedding", count: 8 },
    { type: "birthday", count: 4 },
  ],
  byStatus: [
    { status: "confirmed", count: 9 },
    { status: "preparation", count: 3 },
  ],
};

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
  // Behind the shell's blur go invented numbers, never the venue's own.
  if (!(await getVenueFeatures(venueId)).reports.enabled) {
    return <ReportsClient report={SAMPLE_REPORT} rooms={[]} filters={{ from, to }} />;
  }
  const rooms = await listRooms(venueId, supabase);
  const roomId = rooms.some((r) => r.id === params.room) ? params.room : undefined;
  const report = await getReport(supabase, venueId, { from, to, roomId });

  return <ReportsClient report={report} rooms={rooms.map((r) => ({ id: r.id, name: r.name }))} filters={{ from, to, roomId }} />;
}
