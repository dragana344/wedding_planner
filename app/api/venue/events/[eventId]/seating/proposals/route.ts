import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listEventLayoutElements } from "@/lib/venue/floorplan";
import { assertEventNotPast, EventNotFoundError, PastEventError } from "@/lib/venue/events";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import {
  createSeatingProposal,
  approveSeatingProposal,
  rejectSeatingProposal,
  listSeatingProposals,
  getSeatingProposalDiff,
  ProposalAlreadyRespondedError,
} from "@/lib/seating/proposals";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, ROOM_ID_REQUIRED_ERROR, parseInput, roomIdQuery, uuid } from "@/lib/api/schemas";

// Project A §5: venue-side send/approve/reject. Plain staff can still view
// the room's proposal history (same as viewing the live layout); only the
// act of sending it to the couple, or responding to what the couple sent,
// needs manager elevation.

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";
const NOT_FOUND_ERROR = "Распоредот не е пронајден.";
const paramsSchema = z.object({ eventId: uuid });

const proposalOpBody = z.discriminatedUnion("op", [
  z.object({ op: z.literal("send"), room_id: uuid }),
  z.object({ op: z.literal("approve"), proposal_id: uuid }),
  z.object({ op: z.literal("reject"), proposal_id: uuid, note: z.string().max(2000).nullable().optional() }),
]);

class NotFound extends Error {}

async function assertEventRoom(client: SupabaseClient, venueId: string, eventId: string, roomId: string): Promise<void> {
  const { data, error } = await client
    .from("event_rooms")
    .select("room_id, events!inner(venue_id)")
    .eq("event_id", eventId)
    .eq("room_id", roomId)
    .eq("events.venue_id", venueId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFound(NOT_FOUND_ERROR);
}

async function roomOfProposal(client: SupabaseClient, eventId: string, proposalId: string): Promise<string> {
  const { data, error } = await client
    .from("event_seating_proposals")
    .select("room_id")
    .eq("id", proposalId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFound(NOT_FOUND_ERROR);
  return data.room_id;
}

export const GET = withPublic(
  async ({ request, params }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });

    const client = createServiceRoleClient();
    const proposalId = request.nextUrl.searchParams.get("proposal_id");
    if (proposalId) {
      const parsed = parseInput(uuid, proposalId, "Невалиден предлог.");
      if (!parsed.success) return NextResponse.json({ error: parsed.error }, { status: 400 });
      try {
        const roomId = await roomOfProposal(client, params.eventId, parsed.data);
        await assertEventRoom(client, venueId, params.eventId, roomId);
        return NextResponse.json(await getSeatingProposalDiff(parsed.data, client));
      } catch (err) {
        if (err instanceof NotFound) return NextResponse.json({ error: err.message }, { status: 404 });
        return errorResponse(err, "Не успеа вчитувањето на промените.", request);
      }
    }

    const room = parseInput(roomIdQuery, request.nextUrl.searchParams.get("room_id"), ROOM_ID_REQUIRED_ERROR);
    if (!room.success) return NextResponse.json({ error: room.error }, { status: 400 });

    try {
      await assertEventRoom(client, venueId, params.eventId, room.data);
      return NextResponse.json(await listSeatingProposals(params.eventId, room.data, client));
    } catch (err) {
      if (err instanceof NotFound) return NextResponse.json({ error: err.message }, { status: 404 });
      return errorResponse(err, "Не успеа вчитувањето на предлозите.", request);
    }
  },
  { params: paramsSchema },
);

export const POST = withPublic(
  async ({ request, params, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    const elevation = await requireManagerElevation(request, venueId);
    if (!elevation) return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });

    const client = createServiceRoleClient();
    const eventId = params.eventId;
    try {
      if (body.op === "send") {
        await assertEventRoom(client, venueId, eventId, body.room_id);
        await assertEventNotPast(eventId, venueId, client);
        const elements = await listEventLayoutElements(eventId, body.room_id, client);
        return NextResponse.json(await createSeatingProposal(eventId, body.room_id, "venue", elements, { client, createdBy: elevation.managerName }));
      }
      const roomId = await roomOfProposal(client, eventId, body.proposal_id);
      await assertEventRoom(client, venueId, eventId, roomId);
      await assertEventNotPast(eventId, venueId, client);
      if (body.op === "approve") return NextResponse.json(await approveSeatingProposal(body.proposal_id, elevation.managerName, client));
      return NextResponse.json(await rejectSeatingProposal(body.proposal_id, elevation.managerName, body.note ?? null, client));
    } catch (err) {
      if (err instanceof NotFound) return NextResponse.json({ error: err.message }, { status: 404 });
      if (err instanceof EventNotFoundError) return NextResponse.json({ error: NOT_FOUND_ERROR }, { status: 404 });
      if (err instanceof PastEventError) return NextResponse.json({ error: err.message }, { status: 409 });
      if (err instanceof ProposalAlreadyRespondedError) return NextResponse.json({ error: err.message }, { status: 409 });
      return errorResponse(err, "Не успеа зачувувањето на предлогот.", request);
    }
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: proposalOpBody, params: paramsSchema, invalidBodyError: "Неважечки податоци за предлогот." },
);
