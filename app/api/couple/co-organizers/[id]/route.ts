import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { coOrganizerPasswordBody, idParams } from "@/lib/api/schemas";
import { deleteCoOrganizer, resetCoOrganizerPassword } from "@/lib/couple/co-organizers";
import { MAIN_LOGIN_ONLY_ERROR, organizerSide } from "@/lib/couple/organizer-side";

/** A new password for a co-organizer; their open sessions end. */
export const PATCH = withCoupleEvent(
  async ({ request, eventId, params, body }) => {
    if (organizerSide(request)) return NextResponse.json({ error: MAIN_LOGIN_ONLY_ERROR }, { status: 403 });
    await resetCoOrganizerPassword(eventId, params.id, body.password);
    return NextResponse.json({ ok: true });
  },
  { feature: "co_organizers", params: idParams, body: coOrganizerPasswordBody, fallbackError: "Не успеа промената на лозинката." },
);

export const DELETE = withCoupleEvent(
  async ({ request, eventId, params }) => {
    if (organizerSide(request)) return NextResponse.json({ error: MAIN_LOGIN_ONLY_ERROR }, { status: 403 });
    await deleteCoOrganizer(eventId, params.id);
    return NextResponse.json({ ok: true });
  },
  { feature: "co_organizers", params: idParams, fallbackError: "Не успеа бришењето на ко-организаторот." },
);
