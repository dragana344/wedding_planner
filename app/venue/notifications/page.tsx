import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listVenueNotifications } from "@/lib/venue/notifications";
import { startOfDaySkopjeIso, endOfDaySkopjeIso } from "@/lib/admin/audit-filters";
import { parseNotificationsFilters, type NotificationsSearchParams } from "@/lib/venue/notifications-filters";
import { todayIn } from "@/lib/date";
import { isNotificationColor } from "@/lib/notification-colors";
import { NotificationsList } from "@/components/venue/dashboard/NotificationsList";
import { RangePanel } from "@/components/shared/RangePanel";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<NotificationsSearchParams> }) {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;

  const params = await searchParams;
  const range = parseNotificationsFilters(params);
  const color = isNotificationColor(params.color) ? params.color : null;
  // Legend links keep the range params, so a colour filter does not drop the period.
  const keep: Record<string, string> = {};
  if (range) {
    keep.notifFrom = range.from;
    keep.notifTo = range.to;
  }
  const [items, ranged] = await Promise.all([
    listVenueNotifications(supabase, venueId, 50, undefined, color ?? undefined),
    range
      ? listVenueNotifications(supabase, venueId, 200, { from: startOfDaySkopjeIso(range.from), to: endOfDaySkopjeIso(range.to) }, color ?? undefined)
      : Promise.resolve(null),
  ]);
  const today = todayIn();

  return (
    <div className="wrap">
      <section className="panel">
        <div className="panel-h">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <h2 className="panel-t">Известувања</h2>
            <RangePanel
              title="Известувања по период"
              fromName="notifFrom"
              toName="notifTo"
              defaultFrom={range?.from}
              defaultTo={range?.to}
              isOpen={Boolean(range)}
              resetHref="/venue/notifications"
              resetLabel="Избери друг период"
            >
              {ranged ? (
                <NotificationsList items={ranged} today={today} />
              ) : (
                <p className="muted">Изберете период и притиснете „Прикажи“.</p>
              )}
            </RangePanel>
          </div>
          <span className="count">последни {items.length}</span>
        </div>
        <NotificationsList items={items} today={today} legend={{ active: color, params: keep }} />
      </section>
    </div>
  );
}
