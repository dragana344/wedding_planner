import { NextResponse } from "next/server";
import { z } from "zod";
import { withPublic } from "@/lib/api/handler";
import { uuid } from "@/lib/api/schemas";
import { todayIn } from "@/lib/date";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireManagerForEvent } from "@/lib/venue/event-guard";

// A manager reminds the couple to send their final menu numbers: not once the
// numbers are in, and at most once per (Skopje) day.
export const POST = withPublic(
  async ({ request, params }) => {
    const guard = await requireManagerForEvent(request, params.eventId);
    if (guard instanceof NextResponse) return guard;
    const client = createServiceRoleClient();

    const { count, error: submissionsError } = await client
      .from("event_menu_submissions")
      .select("id", { count: "exact", head: true })
      .eq("event_id", params.eventId);
    if (submissionsError) throw submissionsError;
    if ((count ?? 0) > 0) return NextResponse.json({ error: "Бројките се веќе испратени." }, { status: 409 });

    const { data: last, error: lastError } = await client
      .from("event_couple_reminders")
      .select("reminded_at")
      .eq("event_id", params.eventId)
      .order("reminded_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw lastError;
    if (last && todayIn(undefined, new Date(last.reminded_at as string)) === todayIn()) {
      return NextResponse.json({ error: "Веќе потсетивте денес." }, { status: 429 });
    }

    const { data, error } = await client
      .from("event_couple_reminders")
      .insert({ event_id: params.eventId, reminded_by: guard.managerName })
      .select("reminded_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ remindedAt: data.reminded_at as string });
  },
  { params: z.object({ eventId: uuid }), fallbackError: "Не успеа потсетувањето." },
);
