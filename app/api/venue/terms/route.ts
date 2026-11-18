import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { verifyVenueManager } from "@/lib/venue/manager-elevation";
import { acceptVenueTerms, venueOwnerName, verifyAccountPassword } from "@/lib/venue/onboarding";
import { NOT_AUTHENTICATED_ERROR, withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR } from "@/lib/api/schemas";
import { LEGAL_VERSION } from "@/lib/legal/facts";
import { RATE_LIMITS, checkRateLimit, clientIp, rateLimitedResponse } from "@/lib/security/rate-limit";
import { recordAudit } from "@/lib/audit";
import { logSecurityEvent } from "@/lib/log";

const termsBody = z.object({ password: z.string().min(1).max(200), accepted: z.literal(true) });
// Same wording for a wrong password and a locked owner login (as elevation).
const WRONG_PASSWORD = "Неточна лозинка на сопственикот. По повеќе неуспешни обиди се блокира привремено.";
const WRONG_ACCOUNT_PASSWORD = "Неточна лозинка за најава на локалот.";

/**
 * POST /api/venue/terms: the owner accepts the current Terms (incl. the DPA)
 * for the venue (COMP-001) — on first login (a blocking screen) and after a
 * new LEGAL_VERSION (/venue/terms, from the panel's banner). The venue's
 * login is shared by its staff, so the owner proves who they are with the
 * owner's manager password, checked like an elevation (same rate limit and
 * lockout). A venue with no owner manager login uses its own sign-in
 * password instead. `startTour` is true on the venue's first-ever
 * acceptance, i.e. a brand-new venue.
 */
export const POST = withPublic(
  async ({ request, body }) => {
    const limit = await checkRateLimit(RATE_LIMITS.managerElevation, clientIp(request));
    if (!limit.ok) return rateLimitedResponse(limit);

    const supabase = await createServerSupabaseClient();
    const venueId = await getCurrentVenueId(supabase);
    if (!venueId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });

    const ownerName = await venueOwnerName(venueId);
    if (!ownerName) {
      // No owner manager login (an older venue): the venue's own sign-in
      // password stands in for it, so the venue is never stuck.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email || !(await verifyAccountPassword(user.email, body.password))) {
        logSecurityEvent("terms_account_check_failed", { venue_id: venueId });
        return NextResponse.json({ error: WRONG_ACCOUNT_PASSWORD }, { status: 401 });
      }
      const { firstAcceptance } = await acceptVenueTerms(venueId);
      await recordAudit({
        action: "venue_terms_accepted",
        actorType: "staff",
        actorId: user.id,
        venueId,
        details: { terms_version: LEGAL_VERSION, accepted_with: "account_password" },
      });
      return NextResponse.json({ ok: true, startTour: firstAcceptance });
    }

    const result = await verifyVenueManager(venueId, ownerName, body.password);
    if ("errorCode" in result || !result.isOwner) {
      logSecurityEvent("terms_owner_check_failed", { venue_id: venueId });
      return NextResponse.json({ error: WRONG_PASSWORD }, { status: 401 });
    }

    const { firstAcceptance } = await acceptVenueTerms(venueId);
    await recordAudit({
      action: "venue_terms_accepted",
      actorType: "staff",
      venueId,
      targetId: result.managerId,
      managerName: result.managerName,
      details: { terms_version: LEGAL_VERSION },
    });
    return NextResponse.json({ ok: true, startTour: firstAcceptance });
  },
  {
    invalidJsonError: INVALID_JSON_ERROR,
    body: termsBody,
    invalidBodyError: "Внесете ја лозинката на сопственикот и прифатете ги условите.",
    fallbackError: "Не успеа прифаќањето. Обидете се повторно.",
  },
);
