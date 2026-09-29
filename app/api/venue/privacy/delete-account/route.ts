import { NextResponse } from "next/server";
import { NOT_AUTHENTICATED_ERROR, withPublic } from "@/lib/api/handler";
import { privacyDeleteAccountBody } from "@/lib/api/schemas";
import { REQUEST_ID_HEADER } from "@/lib/log";
import { deleteVenueAccount } from "@/lib/privacy/erase";
import { confirmationMatches, currentStaff } from "@/lib/privacy/staff";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// DATA-006: staff close their venue account. Everything is deleted (venue,
// events, guests, reservations, photos, staff logins); the body must carry
// the venue name exactly, typed by the staff member.
export const POST = withPublic(
  async ({ request, body }) => {
    const staff = await currentStaff();
    if (!staff) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });

    const { data: venue, error } = await createServiceRoleClient()
      .from("venues")
      .select("id, name")
      .eq("id", staff.venueId)
      .maybeSingle();
    if (error) throw error;
    if (!venue) return NextResponse.json({ error: "Локалот не е пронајден." }, { status: 404 });
    if (!confirmationMatches(body.confirm, venue.name)) {
      return NextResponse.json({ error: "Потврдата не се совпаѓа со името на локалот." }, { status: 400 });
    }

    await deleteVenueAccount(venue.id, { actorId: staff.userId, requestId: request.headers.get(REQUEST_ID_HEADER) });
    return NextResponse.json({ ok: true });
  },
  { body: privacyDeleteAccountBody, fallbackError: "Не успеа бришењето на сметката." },
);
