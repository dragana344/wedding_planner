import { NextResponse } from "next/server";
import { z } from "zod";
import { withPublic } from "@/lib/api/handler";
import { uuid } from "@/lib/api/schemas";
import { getSeen, listEventChanges } from "@/lib/changes/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireStaffForEvent } from "@/lib/venue/event-guard";

// Personal or financial: only a manager sees what the values were.
const MANAGER_ONLY_SECTIONS = new Set(["contact", "finance"]);

// Everything the couple changed (no time window: the event window must be
// able to show and clear whatever the "!" badge counts), what the venue has
// already seen, and when the couple was last reminded. Any staff member reads
// it; without a manager token the contact and finance values are left out.
export const GET = withPublic(
  async ({ request, params }) => {
    const guard = await requireStaffForEvent(request, params.eventId);
    if (guard instanceof NextResponse) return guard;
    const [all, seen, reminder] = await Promise.all([
      listEventChanges(params.eventId),
      getSeen(params.eventId, "venue"),
      createServiceRoleClient()
        .from("event_couple_reminders")
        .select("reminded_at")
        .eq("event_id", params.eventId)
        .order("reminded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (reminder.error) throw reminder.error;
    const changes = all
      .filter((c) => c.side === "couple")
      .map((c) => (guard.manager || !MANAGER_ONLY_SECTIONS.has(c.section) ? c : { ...c, oldValue: null, newValue: null }));
    return NextResponse.json({ changes, seen, lastReminderAt: (reminder.data?.reminded_at as string | undefined) ?? null });
  },
  { params: z.object({ eventId: uuid }), fallbackError: "Податоците не можеа да се вчитаат." },
);
