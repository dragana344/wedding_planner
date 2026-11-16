import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { getRequesterThread, replyAsRequester } from "@/lib/support/tickets";
import { withPublic } from "@/lib/api/handler";
import { idParams, supportReplyBody } from "@/lib/api/schemas";

// A venue's own ticket thread. Not actually public: the venue is resolved
// from the signed-in session (never a client-supplied id), same as
// ../route.ts — withPublic only means "no middleware-attached identity".
const EXPIRED = "Сесијата истече. Најавете се повторно.";
const NOT_FOUND = "Барањето не е пронајдено.";

export const GET = withPublic(
  async ({ params }) => {
    const venueId = await getCurrentVenueId(await createServerSupabaseClient());
    if (!venueId) return NextResponse.json({ error: EXPIRED }, { status: 401 });
    const thread = await getRequesterThread({ venueId }, params.id);
    if (!thread) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json(thread);
  },
  { params: idParams, fallbackError: "Разговорот не можеше да се вчита." },
);

export const POST = withPublic(
  async ({ params, body }) => {
    const venueId = await getCurrentVenueId(await createServerSupabaseClient());
    if (!venueId) return NextResponse.json({ error: EXPIRED }, { status: 401 });
    const result = await replyAsRequester({ venueId }, params.id, body.body);
    if (!result) return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    return NextResponse.json({ ok: true, ...result });
  },
  { params: idParams, body: supportReplyBody, fallbackError: "Пораката не се испрати. Обидете се повторно." },
);
