import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { coOrganizerCreateBody } from "@/lib/api/schemas";
import { createCoOrganizer, listCoOrganizers } from "@/lib/couple/co-organizers";
import { MAIN_LOGIN_ONLY_ERROR, organizerSide } from "@/lib/couple/organizer-side";

// A12: the couple's own login manages the co-organizer logins; a
// co-organizer's session is refused.
export const GET = withCoupleEvent(
  async ({ request, eventId }) => {
    if (organizerSide(request)) return NextResponse.json({ error: MAIN_LOGIN_ONLY_ERROR }, { status: 403 });
    return NextResponse.json(await listCoOrganizers(eventId));
  },
  { feature: "co_organizers", fallbackError: "Не успеа вчитувањето на ко-организаторите." },
);

export const POST = withCoupleEvent(
  async ({ request, eventId, body }) => {
    if (organizerSide(request)) return NextResponse.json({ error: MAIN_LOGIN_ONLY_ERROR }, { status: 403 });
    return NextResponse.json(await createCoOrganizer(eventId, body));
  },
  { feature: "co_organizers", body: coOrganizerCreateBody, fallbackError: "Не успеа додавањето на ко-организаторот." },
);
