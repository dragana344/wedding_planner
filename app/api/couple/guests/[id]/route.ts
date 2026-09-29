import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { guestUpdateBody, idParams } from "@/lib/api/schemas";
import { updateGuest, updateGuestStatus, updateGuestSide, deleteGuest } from "@/lib/couple/guests";

export const PATCH = withCoupleEvent(
  async ({ eventId, params, body }) => {
    if (body.type === "status") {
      return NextResponse.json(await updateGuestStatus(eventId, params.id, body.rsvp_status));
    }
    if (body.type === "side") {
      return NextResponse.json(await updateGuestSide(eventId, params.id, body.side));
    }
    const updated = await updateGuest(eventId, params.id, {
      full_name: body.full_name,
      phone: body.phone || null,
      party_size: body.party_size ?? 1,
      notes: body.notes || null,
      side: body.side || null,
    });
    return NextResponse.json(updated);
  },
  { params: idParams, body: guestUpdateBody, fallbackError: "Не успеа ажурирањето на гостинот." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, params }) => {
    await deleteGuest(eventId, params.id);
    return NextResponse.json({ ok: true });
  },
  { params: idParams, fallbackError: "Не успеа бришењето на гостинот." },
);
