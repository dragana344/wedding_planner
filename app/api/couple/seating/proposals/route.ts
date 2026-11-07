import { NextResponse } from "next/server";
import { z } from "zod";
import { withCoupleEvent } from "@/lib/api/handler";
import { parseInput, roomIdQuery, uuid, ROOM_ID_REQUIRED_ERROR } from "@/lib/api/schemas";
import { coupleSeatingActionsFor } from "@/lib/couple/seating";
import { ProposalAlreadyRespondedError } from "@/lib/seating/proposals";

// Project A §5: the couple's side of send/approve/reject. Sending stays on
// the existing /api/couple/seating/confirm route (coupleSeatingActionsFor's
// `confirm`); this route lists the room's history and answers a venue-sent
// proposal — any organizer/co-organizer may do either, no elevation gate.

const proposalActionBody = z.object({ proposal_id: uuid, action: z.enum(["approve", "reject"]), note: z.string().max(2000).nullable().optional() });

export const GET = withCoupleEvent(
  async ({ eventId, request }) => {
    const room = parseInput(roomIdQuery, request.nextUrl.searchParams.get("room_id"), ROOM_ID_REQUIRED_ERROR);
    if (!room.success) return NextResponse.json({ error: room.error }, { status: 400 });
    return NextResponse.json(await coupleSeatingActionsFor(eventId).listProposals!(eventId, room.data));
  },
  { feature: "seating", fallbackError: "Не успеа вчитувањето на предлозите." },
);

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const actions = coupleSeatingActionsFor(eventId);
    try {
      if (body.action === "approve") {
        await actions.approveProposal!(body.proposal_id);
      } else {
        await actions.rejectProposal!(body.proposal_id, body.note ?? null);
      }
    } catch (err) {
      // Re-thrown as a plain Error so the wrapper's fallbackError handling
      // surfaces this specific message (it only trusts plain `new Error`,
      // not subclasses — same convention as lib/couple/seating.ts's own
      // SEATING_BUSY_ERROR).
      if (err instanceof ProposalAlreadyRespondedError) throw new Error(err.message);
      throw err;
    }
    return NextResponse.json({ ok: true });
  },
  { feature: "seating", body: proposalActionBody, fallbackError: "Не успеа зачувувањето на одговорот." },
);
