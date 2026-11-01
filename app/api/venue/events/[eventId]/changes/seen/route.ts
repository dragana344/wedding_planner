import { NextResponse } from "next/server";
import { z } from "zod";
import { withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, uuid } from "@/lib/api/schemas";
import { markSeen } from "@/lib/changes/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireManagerForEvent } from "@/lib/venue/event-guard";

// Видено: a manager confirms the venue has read the couple's changes in one
// section, up to the newest one they were shown. The saved position only moves
// forward; if the couple changed more since, it is still saved but flagged so
// the screen can ask for a refresh.
export const POST = withPublic(
  async ({ request, params, body }) => {
    const guard = await requireManagerForEvent(request, params.eventId);
    if (guard instanceof NextResponse) return guard;
    await markSeen(params.eventId, "venue", body.section, body.up_to, guard.managerName);
    // Compared in the database with the original string: JS dates lose microseconds.
    const { count, error } = await createServiceRoleClient()
      .from("event_changes")
      .select("id", { count: "exact", head: true })
      .eq("event_id", params.eventId)
      .eq("side", "couple")
      .eq("section", body.section)
      .gt("changed_at", body.up_to);
    if (error) throw error;
    return NextResponse.json((count ?? 0) > 0 ? { ok: true, newer: true } : { ok: true });
  },
  {
    params: z.object({ eventId: uuid }),
    invalidJsonError: INVALID_JSON_ERROR,
    body: z.object({ section: z.enum(["guest_count", "contact"]), up_to: z.string().datetime({ offset: true }) }),
    fallbackError: "Не успеа означувањето како видено.",
  },
);
