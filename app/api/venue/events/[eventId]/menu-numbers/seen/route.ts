import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireManagerForEvent } from "@/lib/venue/event-guard";
import { requireManagerElevation } from "@/lib/venue/manager-guard";
import { errorResponse, withRequestLog } from "@/lib/api/handler";
import { uuid } from "@/lib/api/schemas";

const paramsSchema = z.object({ eventId: uuid });
const bodySchema = z.object({ submission_id: uuid });

/**
 * Видено: a manager confirms the venue has read the couple's latest menu
 * numbers. Confirms the specific sending the manager saw (409 if a newer one arrived), only while it is unseen, so
 * repeating the call is harmless.
 */
export async function POST(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return withRequestLog(request, async () => {
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) return NextResponse.json({ error: "Настанот не е пронајден." }, { status: 404 });
    const { eventId } = parsed.data;
    try {
      const body = bodySchema.safeParse(await request.json().catch(() => null));
      if (!body.success) return NextResponse.json({ error: "Невалидно барање." }, { status: 400 });
      const submissionId = body.data.submission_id;
      const guard = await requireManagerForEvent(request, eventId);
      if (guard instanceof NextResponse) return guard;
      const manager = await requireManagerElevation(request, guard.venueId);
      if (!manager) return NextResponse.json({ error: "Потребна е најава како менаџер." }, { status: 403 });

      const client = createServiceRoleClient();
      const { data: latest, error } = await client
        .from("event_menu_submissions")
        .select("id, seen_at")
        .eq("event_id", eventId)
        .order("sent_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!latest) return NextResponse.json({ error: "Парот сè уште не ги испратил бројките." }, { status: 404 });

      if (latest.id !== submissionId) {
        return NextResponse.json({ error: "Парот испрати нови бројки — освежете." }, { status: 409 });
      }

      if (latest.seen_at === null) {
        const { error: updateError } = await client
          .from("event_menu_submissions")
          .update({ seen_at: new Date().toISOString(), seen_by: manager.managerName })
          .eq("id", submissionId)
          .eq("event_id", eventId)
          .is("seen_at", null);
        if (updateError) throw updateError;
      }
      return NextResponse.json({ ok: true });
    } catch (err) {
      return errorResponse(err, "Не успеа означувањето како видено.", request);
    }
  });
}
