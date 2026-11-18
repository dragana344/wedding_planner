import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { idParams, supportReplyBody } from "@/lib/api/schemas";
import { getRequesterThread, replyAsRequester } from "@/lib/support/tickets";

const NOT_FOUND = "Барањето не е пронајдено.";

export const GET = withCoupleEvent(
  async ({ eventId, params }) => {
    const thread = await getRequesterThread({ eventId }, params.id);
    if (!thread) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json(thread);
  },
  { params: idParams, fallbackError: "Разговорот не можеше да се вчита." },
);

export const POST = withCoupleEvent(
  async ({ eventId, params, body }) => {
    const result = await replyAsRequester({ eventId }, params.id, body.body);
    if (!result) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ ok: true, ...result });
  },
  { params: idParams, body: supportReplyBody, allowAfterEvent: true, fallbackError: "Пораката не се испрати. Обидете се повторно." },
);
