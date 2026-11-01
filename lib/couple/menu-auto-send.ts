import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { currentMenuNumbers } from "@/lib/couple/menu-submissions";
import { todayIn, VENUE_TIME_ZONE } from "@/lib/date";
import { errorFields, log } from "@/lib/log";
import { daysUntil, timelineStage } from "@/lib/menu-timeline";

/**
 * Sends the final menu numbers for events 15 days out (or less) that the
 * couple never sent: confirmed guests only, with the count of guests still
 * without an answer. Safe to run twice: the insert itself refuses an event
 * that already has a submission. Cancelled events are skipped; one event
 * failing is logged and does not stop the rest.
 */
export async function runMenuAutoSend(now: Date): Promise<{ sent: string[] }> {
  const client = createServiceRoleClient();
  const today = todayIn(VENUE_TIME_ZONE, now);
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 15);

  const { data, error } = await client
    .from("events")
    .select("id, event_date, created_at, event_menu_submissions(id)")
    .is("personal_data_erased_at", null)
    .neq("status", "cancelled")
    .gte("event_date", today)
    .lte("event_date", horizon.toISOString().slice(0, 10))
    .order("event_date", { ascending: true });
  if (error) throw error;

  const sent: string[] = [];
  for (const event of data ?? []) {
    const submissions = event.event_menu_submissions as { id: string }[] | null;
    const stage = timelineStage({
      eventDate: event.event_date,
      createdDate: todayIn(VENUE_TIME_ZONE, new Date(event.created_at)),
      today,
      sent: (submissions ?? []).length > 0,
    });
    if (stage !== "auto_send" || daysUntil(event.event_date, today) < 0) continue;

    try {
      const { numbers, notDone } = await currentMenuNumbers(event.id);
      if (numbers.menus.length === 0) continue;
      const { data: inserted, error: insertError } = await client.rpc("insert_auto_menu_submission", {
        p_event_id: event.id,
        p_counts: Object.fromEntries(numbers.menus.map((m) => [m.id, m.count])),
        p_titles: Object.fromEntries(numbers.menus.map((m) => [m.id, m.name])),
        p_total: numbers.total,
        p_unanswered: notDone.length,
      });
      if (insertError) throw insertError;
      if (inserted) sent.push(event.id);
    } catch (err) {
      log("error", "menu_auto_send_failed", { event_id: event.id, ...errorFields(err) });
    }
  }
  return { sent };
}
