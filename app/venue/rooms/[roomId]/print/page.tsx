import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getRoomById, listTableTypes } from "@/lib/venue/rooms";
import { listFixedElements, listRoomLayoutElements } from "@/lib/venue/floorplan";
import { getVenueLogoUrl } from "@/lib/venue/venue-profile";
import { buildPrintRoom } from "@/lib/seating/print";
import { PrintPlan } from "@/components/seating/print/PrintPlan";
import { printSerif } from "@/components/seating/print/font";

export const dynamic = "force-dynamic";

/** The room's own standing layout (not any one event's) — same printable
 * plan as an event's, just with an empty guest/seat list, since a room
 * template has no guests to begin with. */
export default async function RoomPrintPlanPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  if (!venueId) notFound();
  const room = await getRoomById(roomId, supabase);
  if (!room || room.venue_id !== venueId) notFound();

  const [fixedElements, layoutElements, tableTypes, logoUrl] = await Promise.all([
    listFixedElements(room.id, supabase),
    listRoomLayoutElements(room.id, supabase),
    listTableTypes(room.id, supabase),
    getVenueLogoUrl(venueId, supabase).catch(() => null),
  ]);

  const printRoom = buildPrintRoom(room, layoutElements, fixedElements, [], tableTypes);

  return (
    <PrintPlan
      title={room.name}
      subtitle="Стандарден распоред"
      logoUrl={logoUrl}
      rooms={[printRoom]}
      fontClassName={printSerif.variable}
      backHref={`/venue/rooms/${room.id}/floor-plan`}
    />
  );
}
