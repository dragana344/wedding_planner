import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";
import { coupleSeatingClientActions } from "@/lib/couple/seating-client-actions";
import { EventSeatingPage } from "@/components/venue/dashboard/EventSeatingPage";
import { listEventLayoutElements } from "@/lib/venue/floorplan";
import { listTableTypes } from "@/lib/venue/rooms";
import { getRoomSeating } from "@/lib/seating/seats";
import { effectiveSeatingSelfEditEnabled, SEATING_SELF_EDIT_DISABLED_NOTICE } from "@/lib/seating/self-edit";
import { eventHasFeature } from "@/lib/entitlements/server";
import { getVenueLogoUrl } from "@/lib/venue/venue-profile";

export default async function CoupleSeatingPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  const eventId = (await headers()).get("x-couple-event-id")!;
  const client = createServiceRoleClient();

  const { data: room } = await client.from("rooms").select("*").eq("id", roomId).single();
  const { data: event } = await client.from("events").select("venue_id, couple_names, seating_self_edit_enabled, seating_mode").eq("id", eventId).single();
  if (!room || !event) notFound();
  // Project B §3: a mini-event never gets a seating editor, not even a
  // read-only one — reaching this route directly (e.g. a stale link) is a
  // plain 404, same as any other room this event isn't assigned to.
  if (event.seating_mode === "mini") notFound();

  const { data: eventRoomLink, error: eventRoomLinkError } = await client
    .from("event_rooms")
    .select("room_id")
    .eq("event_id", eventId)
    .eq("room_id", room.id)
    .maybeSingle();
  if (eventRoomLinkError) throw eventRoomLinkError;
  if (!eventRoomLink) notFound();

  const { data: venue, error: venueError } = await client
    .from("venues")
    .select("couple_seating_self_edit_enabled")
    .eq("id", event.venue_id)
    .single();
  if (venueError) throw venueError;
  const selfEditEnabled = effectiveSeatingSelfEditEnabled(venue.couple_seating_self_edit_enabled, event.seating_self_edit_enabled);

  const serverActions = coupleSeatingActionsFor(eventId);
  const fixedElements = await serverActions.listFixedElements(room.id);
  const tableTypes = await listTableTypes(room.id, client);
  const canPrintQr = await eventHasFeature(eventId, "print_qr");
  const logoUrl = await getVenueLogoUrl(event.venue_id, client);

  if (!selfEditEnabled) {
    // §4: no draft, no reset-to-baseline, read-only — the current live
    // layout (not the organizer's possibly-stale draft) is what's shown.
    const initialLayoutElements = await listEventLayoutElements(eventId, room.id, client);
    const seating = await getRoomSeating(eventId, room.id);
    return (
      <EventSeatingPage
        eventId={eventId}
        eventName={event.couple_names}
        room={room}
        initialFixedElements={fixedElements}
        initialLayoutElements={initialLayoutElements}
        initialTableTypes={tableTypes}
        initialSeating={seating}
        printLinks={{ plan: "/couple/seating/print", qr: canPrintQr ? "/couple/seating/print?view=qr" : undefined }}
        actions={coupleSeatingClientActions}
        skipInitialization
        viewOnly
        viewOnlyNotice={SEATING_SELF_EDIT_DISABLED_NOTICE}
        backHref="/couple"
        backLabel="← Назад кон почетна"
        logoUrl={logoUrl}
      />
    );
  }

  // Server-side: ensures the standard layout is copied in and an undo
  // snapshot is captured before the client component ever mounts, so the
  // couple's client actions (Step above) never need to do either themselves.
  const initialLayoutElements = await serverActions.initializeFromStandard(eventId, room.id);
  await serverActions.captureSnapshot(eventId, room.id);
  const seating = await getRoomSeating(eventId, room.id);

  return (
    <EventSeatingPage
      eventId={eventId}
      eventName={event.couple_names}
      room={room}
      initialFixedElements={fixedElements}
      initialLayoutElements={initialLayoutElements}
      initialTableTypes={tableTypes}
      initialSeating={seating}
      printLinks={{ plan: "/couple/seating/print", qr: canPrintQr ? "/couple/seating/print?view=qr" : undefined }}
      actions={coupleSeatingClientActions}
      skipInitialization
      backHref="/couple"
      backLabel="← Назад кон почетна"
      logoUrl={logoUrl}
    />
  );
}
