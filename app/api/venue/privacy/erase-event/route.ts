import { NextResponse } from "next/server";
import { NOT_AUTHENTICATED_ERROR, withPublic } from "@/lib/api/handler";
import { privacyEraseEventBody } from "@/lib/api/schemas";
import { REQUEST_ID_HEADER } from "@/lib/log";
import { eraseEventPersonalData } from "@/lib/privacy/erase";
import { confirmationMatches, currentStaff } from "@/lib/privacy/staff";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// DATA-006: staff erase one event's couple and guest data. The body must
// carry the couple's names exactly as shown, typed by the staff member.
export const POST = withPublic(
  async ({ request, body }) => {
    const staff = await currentStaff();
    if (!staff) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });

    const { data: event, error } = await createServiceRoleClient()
      .from("events")
      .select("id, couple_names")
      .eq("id", body.event_id)
      .eq("venue_id", staff.venueId)
      .maybeSingle();
    if (error) throw error;
    if (!event) return NextResponse.json({ error: "Настанот не е пронајден." }, { status: 404 });
    if (!confirmationMatches(body.confirm, event.couple_names)) {
      return NextResponse.json({ error: "Потврдата не се совпаѓа со имињата на настанот." }, { status: 400 });
    }

    await eraseEventPersonalData(event.id, { actorId: staff.userId, requestId: request.headers.get(REQUEST_ID_HEADER) });
    return NextResponse.json({ ok: true });
  },
  { body: privacyEraseEventBody, fallbackError: "Не успеа бришењето на личните податоци." },
);
