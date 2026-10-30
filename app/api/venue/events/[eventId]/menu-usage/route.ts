import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireManagerForEvent } from "@/lib/venue/event-guard";
import { errorResponse, withRequestLog } from "@/lib/api/handler";
import { uuid } from "@/lib/api/schemas";

const paramsSchema = z.object({ eventId: uuid });

/**
 * How many guests chose each of the event's menus — manager only. The edit
 * form warns with these before a menu is removed from the event, since
 * unlinking it deletes those guests' choices.
 */
export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  return withRequestLog(request, async () => {
    const parsed = paramsSchema.safeParse(await context.params);
    if (!parsed.success) return NextResponse.json({ error: "Настанот не е пронајден." }, { status: 404 });
    const { eventId } = parsed.data;
    try {
      const guard = await requireManagerForEvent(request, eventId);
      if (guard instanceof NextResponse) return guard;

      const client = createServiceRoleClient();
      const { data: links, error: linksError } = await client
        .from("event_menu_templates")
        .select("menu_template_id")
        .eq("event_id", eventId);
      if (linksError) throw linksError;
      const usage: Record<string, number> = {};
      for (const link of links ?? []) usage[link.menu_template_id] = 0;

      const { data: counts, error: countsError } = await client
        .from("event_guest_menu_counts")
        .select("guest_id, menu_template_id, event_guests!inner(event_id)")
        .eq("event_guests.event_id", eventId)
        .limit(50000);
      if (countsError) throw countsError;
      const guestsPerMenu = new Map<string, Set<string>>();
      for (const row of counts ?? []) {
        const set = guestsPerMenu.get(row.menu_template_id) ?? new Set<string>();
        set.add(row.guest_id);
        guestsPerMenu.set(row.menu_template_id, set);
      }
      for (const [menuId, guests] of guestsPerMenu) usage[menuId] = guests.size;

      return NextResponse.json({ usage });
    } catch (err) {
      return errorResponse(err, "Податоците не можеа да се вчитаат.", request);
    }
  });
}
