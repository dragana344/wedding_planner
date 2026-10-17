import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { validateManagerElevation } from "@/lib/venue/manager-elevation";
import { clearPasswordResetNotice } from "@/lib/venue/managers";
import { withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, managerDeauthorizeBody } from "@/lib/api/schemas";

// Reuses the token-only body shape from deauthorize — same elevation token,
// different action. Unlike deauthorize, this writes to venue_managers, so
// (unlike that route) it resolves managerId from the token server-side
// rather than trusting anything the client sends, and 401s rather than
// no-op'ing on an invalid/expired token.
export const POST = withPublic(
  async ({ body }) => {
    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: "Сесијата истече. Најавете се повторно." }, { status: 401 });

    const manager = await validateManagerElevation(body.token, venueId);
    if (!manager) return NextResponse.json({ error: "Елевацијата истече." }, { status: 401 });

    await clearPasswordResetNotice(manager.managerId);
    return NextResponse.json({ ok: true });
  },
  { invalidJsonError: INVALID_JSON_ERROR, body: managerDeauthorizeBody, invalidBodyError: INVALID_JSON_ERROR },
);
