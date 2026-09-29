import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getRoomById, listTableTypes } from "@/lib/venue/rooms";
import { listFixedElements, listRoomLayoutElements } from "@/lib/venue/floorplan";
import { RoomFloorPlanPage } from "@/components/venue/dashboard/RoomFloorPlanPage";

export default async function RoomFloorPlanRoute({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  if (!venueId) notFound();

  const { roomId } = await params;
  const room = await getRoomById(roomId, supabase);
  if (!room || room.venue_id !== venueId) notFound();

  const [fixedElements, layoutElements, tableTypes] = await Promise.all([
    listFixedElements(room.id, supabase),
    listRoomLayoutElements(room.id, supabase),
    listTableTypes(room.id, supabase),
  ]);

  return (
    <RoomFloorPlanPage
      venueId={venueId}
      room={room}
      initialFixedElements={fixedElements}
      initialLayoutElements={layoutElements}
      initialTableTypes={tableTypes}
    />
  );
}
