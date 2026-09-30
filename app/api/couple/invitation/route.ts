// app/api/couple/invitation/route.ts
import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { invitationBody } from "@/lib/api/schemas";
import { getInvitation, upsertInvitation } from "@/lib/couple/invitations";

export const GET = withCoupleEvent(
  async ({ eventId }) => NextResponse.json(await getInvitation(eventId)),
  { feature: "invitation", fallbackError: "Не успеа вчитувањето на поканата." },
);

export const PUT = withCoupleEvent(
  async ({ eventId, body }) => {
    const saved = await upsertInvitation(eventId, { template_id: body.template_id, message: body.message || null });
    return NextResponse.json(saved);
  },
  { feature: "invitation", body: invitationBody, fallbackError: "Не успеа зачувувањето на поканата." },
);
