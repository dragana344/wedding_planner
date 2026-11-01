import { NextResponse } from "next/server";
import { z } from "zod";
import { withPublic } from "@/lib/api/handler";
import { INVALID_JSON_ERROR, uuid } from "@/lib/api/schemas";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireManagerForEvent } from "@/lib/venue/event-guard";
import { assertEventNotPast, PastEventError } from "@/lib/venue/events";

// The venue enters the final menu numbers itself (e.g. the couple phoned
// them in). Stored like a sending, marked as the venue's own and already seen.
export const POST = withPublic(
  async ({ request, params, body }) => {
    const guard = await requireManagerForEvent(request, params.eventId);
    if (guard instanceof NextResponse) return guard;
    const client = createServiceRoleClient();
    try {
      await assertEventNotPast(params.eventId, guard.venueId, client);
    } catch (err) {
      if (err instanceof PastEventError) return NextResponse.json({ error: err.message }, { status: 409 });
      throw err;
    }

    const { data: links, error } = await client
      .from("event_menu_templates")
      .select("menu_template_id, menu_templates(name)")
      .eq("event_id", params.eventId);
    if (error) throw error;
    const titles: Record<string, string> = {};
    for (const l of (links ?? []) as unknown as { menu_template_id: string; menu_templates: { name: string } | null }[]) {
      titles[l.menu_template_id] = l.menu_templates?.name ?? "";
    }
    const menuIds = Object.keys(titles);
    if (menuIds.length === 0) return NextResponse.json({ error: "Настанот нема мени." }, { status: 400 });
    if (Object.keys(body.counts).some((id) => !(id in titles))) {
      return NextResponse.json({ error: "Непознато мени." }, { status: 400 });
    }

    const counts = Object.fromEntries(menuIds.map((id) => [id, body.counts[id] ?? 0]));
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    // insert_venue_menu_submission (0129) skips the insert when this event already
    // has an identical venue submission from the last few seconds, so a retried
    // request or a double-click racing past the UI's own busy guard never creates
    // a duplicate history row.
    const { error: insertError } = await client.rpc("insert_venue_menu_submission", {
      p_event_id: params.eventId,
      p_sent_by: guard.managerName,
      p_counts: counts,
      p_titles: titles,
      p_total: total,
    });
    if (insertError) throw insertError;
    return NextResponse.json({ ok: true });
  },
  {
    params: z.object({ eventId: uuid }),
    invalidJsonError: INVALID_JSON_ERROR,
    body: z.object({ counts: z.record(uuid, z.number().int().min(0).max(100_000)) }),
    fallbackError: "Не успеа зачувувањето на бројките.",
  },
);
