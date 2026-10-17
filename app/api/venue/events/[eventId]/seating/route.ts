import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { staffLayoutActions } from "@/lib/venue/floorplan-history";
import { assertEventNotPast, EventNotFoundError, PastEventError } from "@/lib/venue/events";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { NOT_AUTHENTICATED_ERROR, errorResponse, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, ID_LIST_MAX, seatingElementCreateBody, seatingElementUpdateBody, uuid } from "@/lib/api/schemas";

// Every staff write to an event's seating layout (migration 0104 left staff
// read-only on event_layout_elements / layout_history / seat assignments).
// The manager-elevation check is the write's real authorization; the write
// itself uses the service-role client, which bypasses RLS — so the event,
// room and element are each checked against the caller's venue here first.

const MANAGER_REQUIRED_ERROR = "Потребна е најава како менаџер.";
const NOT_FOUND_ERROR = "Распоредот не е пронајден.";
const paramsSchema = z.object({ eventId: uuid });

const seatingOpBody = z.discriminatedUnion("op", [
  z.object({ op: z.literal("initialize"), room_id: uuid }),
  z.object({ op: z.literal("add"), element: seatingElementCreateBody }),
  z.object({ op: z.literal("update"), element_id: uuid, change: seatingElementUpdateBody }),
  z.object({ op: z.literal("delete"), element_id: uuid }),
  z.object({ op: z.literal("revert"), room_id: uuid }),
  z.object({ op: z.literal("undo"), room_id: uuid }),
  z.object({ op: z.literal("redo"), room_id: uuid }),
  z.object({ op: z.literal("group"), room_id: uuid, element_ids: z.array(uuid).min(2).max(ID_LIST_MAX) }),
  z.object({ op: z.literal("ungroup"), room_id: uuid, group_id: uuid }),
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

async function roomOfElement(client: SupabaseClient, eventId: string, elementId: string): Promise<string> {
  const { data, error } = await client
    .from("event_layout_elements")
    .select("room_id")
    .eq("id", elementId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new NotFound(NOT_FOUND_ERROR);
  return data.room_id;
}

async function assertTableTypeInRoom(client: SupabaseClient, roomId: string, tableTypeId: string): Promise<void> {
  const { data, error } = await client.from("table_types").select("room_id").eq("id", tableTypeId).maybeSingle();
  if (error) throw error;
  if (!data || data.room_id !== roomId) throw new NotFound(NOT_FOUND_ERROR);
}

export const POST = withPublic(
  async ({ request, params, body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
    // Copying the venue's standard layout into a room nobody has opened yet
    // isn't an edit — plain staff need it just to view the plan.
    if (body.op !== "initialize" && !(await requireManagerElevation(request, venueId))) {
      return NextResponse.json({ error: MANAGER_REQUIRED_ERROR }, { status: 403 });
    }

    const client = createServiceRoleClient();
    const actions = staffLayoutActions(client);
    const eventId = params.eventId;
    try {
      // Security review fix: past events are read-only, server-side, same as
      // the rest of an event's write surface. "initialize" is exempt for the
      // same reason it's exempt from manager elevation above — it's what
      // makes a past event's seating viewable at all the first time anyone
      // opens it, not really an edit from the caller's perspective.
      if (body.op !== "initialize") await assertEventNotPast(eventId, venueId, client);
      switch (body.op) {
        case "add": {
          const { element } = body;
          await assertEventRoom(client, venueId, eventId, element.room_id);
          if (element.table_type_id) await assertTableTypeInRoom(client, element.room_id, element.table_type_id);
          return NextResponse.json(await actions.addElement({ ...element, event_id: eventId }));
        }
        case "update": {
          await assertEventRoom(client, venueId, eventId, await roomOfElement(client, eventId, body.element_id));
          const { change } = body;
          const id = body.element_id;
          if (change.type === "position") return NextResponse.json(await actions.moveElement(id, change.x_cm, change.y_cm));
          if (change.type === "size") return NextResponse.json(await actions.resizeElement(id, change.width_cm, change.length_cm));
          if (change.type === "label") return NextResponse.json(await actions.relabelElement!(id, change.label ?? null));
          return NextResponse.json(await actions.rotateElement(id, change.rotation_deg));
        }
        case "delete": {
          await assertEventRoom(client, venueId, eventId, await roomOfElement(client, eventId, body.element_id));
          await actions.deleteElement(body.element_id);
          return NextResponse.json({ ok: true });
        }
        default: {
          await assertEventRoom(client, venueId, eventId, body.room_id);
          const roomId = body.room_id;
          if (body.op === "initialize") return NextResponse.json(await actions.initializeFromStandard(eventId, roomId));
          if (body.op === "revert") return NextResponse.json(await actions.revertToStandard(eventId, roomId));
          if (body.op === "undo") return NextResponse.json(await actions.undo(eventId, roomId));
          if (body.op === "redo") return NextResponse.json(await actions.redo!(eventId, roomId));
          if (body.op === "group") return NextResponse.json(await actions.group!(eventId, roomId, body.element_ids));
          return NextResponse.json(await actions.ungroup!(eventId, roomId, body.group_id));
        }
      }
    } catch (err) {
      if (err instanceof NotFound) return NextResponse.json({ error: err.message }, { status: 404 });
      if (err instanceof EventNotFoundError) return NextResponse.json({ error: NOT_FOUND_ERROR }, { status: 404 });
      if (err instanceof PastEventError) return NextResponse.json({ error: err.message }, { status: 409 });
      return errorResponse(err, "Распоредот не можеше да се зачува.", request);
    }
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: seatingOpBody, params: paramsSchema, invalidBodyError: "Неважечки податоци за распоредот." },
);
