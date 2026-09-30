import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getEventById } from "@/lib/venue/events";
import { getRoomById, listTableTypes } from "@/lib/venue/rooms";
import { listFixedElements, listEventLayoutElements } from "@/lib/venue/floorplan";
import { EventSeatingPage } from "@/components/venue/dashboard/EventSeatingPage";
import { getRoomSeatingForStaff } from "@/lib/seating/read";

export default async function EventSeatingRoute({
  params,
}: {
  params: Promise<{ eventId: string; roomId: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  if (!venueId) notFound();

  const { eventId, roomId } = await params;
  const event = await getEventById(eventId, supabase);
  const room = await getRoomById(roomId, supabase);
  if (!event || !room || event.venue_id !== venueId || room.venue_id !== venueId) notFound();

  const { data: eventRoomLink, error: eventRoomLinkError } = await supabase
    .from("event_rooms")
    .select("room_id")
    .eq("event_id", event.id)
    .eq("room_id", room.id)
    .maybeSingle();
  if (eventRoomLinkError) throw eventRoomLinkError;
  if (!eventRoomLink) notFound();

  const [fixedElements, layoutElements, tableTypes, seating] = await Promise.all([
    listFixedElements(room.id, supabase),
    listEventLayoutElements(event.id, room.id, supabase),
    listTableTypes(room.id, supabase),
    getRoomSeatingForStaff(supabase, event.id, room.id),
  ]);

  return (
    <EventSeatingPage
      eventId={event.id}
      eventName={event.couple_names}
      room={room}
      initialFixedElements={fixedElements}
      initialLayoutElements={layoutElements}
      initialTableTypes={tableTypes}
      initialSeating={seating}
      seatingReadOnly
      printLinks={{ plan: `/venue/events/${event.id}/print/plan`, qr: `/venue/events/${event.id}/print/qr` }}
    />
  );
}
