import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";
import { coupleSeatingClientActions } from "@/lib/couple/seating-client-actions";
import { EventSeatingPage } from "@/components/venue/dashboard/EventSeatingPage";
import { listTableTypes } from "@/lib/venue/rooms";

export default async function CoupleSeatingPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const eventId = (await headers()).get("x-couple-event-id")!;
  const client = createServiceRoleClient();

  const { data: room } = await client.from("rooms").select("*").eq("id", roomId).single();
  const { data: event } = await client.from("events").select("couple_names").eq("id", eventId).single();
  if (!room || !event) notFound();

  const { data: eventRoomLink, error: eventRoomLinkError } = await client
    .from("event_rooms")
    .select("room_id")
    .eq("event_id", eventId)
    .eq("room_id", room.id)
    .maybeSingle();
  if (eventRoomLinkError) throw eventRoomLinkError;
  if (!eventRoomLink) notFound();

  // Server-side: ensures the standard layout is copied in and an undo
  // snapshot is captured before the client component ever mounts, so the
  // couple's client actions (Step above) never need to do either themselves.
  const serverActions = coupleSeatingActionsFor(eventId);
  const fixedElements = await serverActions.listFixedElements(room.id);
  const initialLayoutElements = await serverActions.initializeFromStandard(eventId, room.id);
  await serverActions.captureSnapshot(eventId, room.id);
  const tableTypes = await listTableTypes(room.id, client);

  return (
    <EventSeatingPage
      eventId={eventId}
      eventName={event.couple_names}
      room={room}
      initialFixedElements={fixedElements}
      initialLayoutElements={initialLayoutElements}
      initialTableTypes={tableTypes}
      actions={coupleSeatingClientActions}
      skipInitialization
      backHref="/couple"
      backLabel="← Назад кон почетна"
    />
  );
}
