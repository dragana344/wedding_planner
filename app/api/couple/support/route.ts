// app/api/couple/support/route.ts
import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { supportTicketBody } from "@/lib/api/schemas";
import { listCoupleSupportTickets, submitCoupleSupportTicket } from "@/lib/couple/support";

export const GET = withCoupleEvent(
  async ({ eventId }) => NextResponse.json(await listCoupleSupportTickets(eventId)),
  { fallbackError: "Не успеа вчитувањето на барањата." },
);

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const ticket = await submitCoupleSupportTicket(eventId, body);
    return NextResponse.json({ ok: true, ticket });
  },
  { body: supportTicketBody, fallbackError: "Барањето не се испрати. Обидете се повторно." },
);
