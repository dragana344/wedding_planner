import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { guestUpdateBody, idParams } from "@/lib/api/schemas";
import { updateGuest, updateGuestStatus, updateGuestSide, updateGuestInvited, setGuestMenuCounts, deleteGuest, assertGuestOnSide } from "@/lib/couple/guests";
import { organizerSide } from "@/lib/couple/organizer-side";
import { coupleChangerName } from "@/lib/changes/server";
import { noteNumbersChange } from "@/lib/couple/numbers-changes";
import { trackCoupleEdit } from "@/lib/couple/rsvp-answers";

// After a write that can move the menu numbers: flag it to the venue if they were already sent (0182).
async function numbersMoved(request: Request, eventId: string) {
  await noteNumbersChange(eventId, coupleChangerName(organizerSide(request)));
}

export const PATCH = withCoupleEvent(
  async ({ request, eventId, params, body }) => {
    if (body.type === "status") {
      // Decision 8: the couple's own changes are in the answer history too (0184).
      const guest = await trackCoupleEdit(eventId, params.id, () => updateGuestStatus(eventId, params.id, body.rsvp_status));
      await numbersMoved(request, eventId);
      return NextResponse.json(guest);
    }
    // Moving a guest between sides, editing or deleting one: a co-organizer
    // only for their own side (recording an answer above stays open to both).
    await assertGuestOnSide(eventId, params.id, organizerSide(request));
    if (body.type === "menus") {
      const guest = await trackCoupleEdit(eventId, params.id, () => setGuestMenuCounts(eventId, params.id, body.counts, body.no_meal_count));
      await numbersMoved(request, eventId);
      return NextResponse.json(guest);
    }
    if (body.type === "side") {
      return NextResponse.json(await updateGuestSide(eventId, params.id, body.side));
    }
    if (body.type === "invited") {
      return NextResponse.json(await updateGuestInvited(eventId, params.id, body.invited_party_size));
    }
    const updated = await trackCoupleEdit(eventId, params.id, () =>
      updateGuest(eventId, params.id, {
        full_name: body.full_name,
        phone: body.phone || null,
        email: body.email || null,
        party_size: body.party_size ?? 1,
        notes: body.notes || null,
        side: body.side || null,
        invited_party_size: body.invited_party_size,
      }),
    );
    await numbersMoved(request, eventId);
    return NextResponse.json(updated);
  },
  { params: idParams, body: guestUpdateBody, fallbackError: "Не успеа ажурирањето на гостинот." },
);

export const DELETE = withCoupleEvent(
  async ({ request, eventId, params }) => {
    await assertGuestOnSide(eventId, params.id, organizerSide(request));
    await deleteGuest(eventId, params.id);
    await numbersMoved(request, eventId);
    return NextResponse.json({ ok: true });
  },
  { params: idParams, fallbackError: "Не успеа бришењето на гостинот." },
);
