import { NextResponse } from "next/server";
import { z } from "zod";
import { withCoupleEvent } from "@/lib/api/handler";
import { INVALID_JSON_ERROR } from "@/lib/api/schemas";
import { coupleChangerName, markSeen } from "@/lib/changes/server";
import { organizerSide } from "@/lib/couple/organizer-side";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const SECTIONS = ["date_time", "rooms", "menus", "guest_count", "contact", "finance", "menu_numbers", "guest_replies"] as const;

// Видено: the couple confirms they have read the venue's changes in one
// section, up to the newest one they were shown. The saved position only moves
// forward; if the venue changed more since, it is still saved but flagged so
// the screen can ask for a refresh. Compared in the database with the original
// string: JS dates lose microseconds.
export const POST = withCoupleEvent(
  async ({ request, eventId, body }) => {
    await markSeen(eventId, "couple", body.section, body.up_to, coupleChangerName(organizerSide(request)));
    const client = createServiceRoleClient();
    let query;
    if (body.section === "menu_numbers") {
      query = client.from("event_menu_submissions").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("source", "venue").gt("sent_at", body.up_to);
    } else if (body.section === "guest_replies") {
      query = client.from("audit_log").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("action", "public_rsvp").gt("occurred_at", body.up_to);
    } else {
      query = client.from("event_changes").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("side", "venue").eq("section", body.section).gt("changed_at", body.up_to);
    }
    const { count, error } = await query;
    if (error) throw error;
    return NextResponse.json((count ?? 0) > 0 ? { ok: true, newer: true } : { ok: true });
  },
  {
    invalidJsonError: INVALID_JSON_ERROR,
    body: z.object({ section: z.enum(SECTIONS), up_to: z.string().datetime({ offset: true }) }),
    fallbackError: "Не успеа означувањето како видено.",
  },
);
