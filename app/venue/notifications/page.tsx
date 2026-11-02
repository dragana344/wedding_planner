import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listVenueNotifications } from "@/lib/venue/notifications";
import { listManagers } from "@/lib/venue/managers";
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
  const manager = params.manager?.trim() || null;
  // Each legend keeps the other filters' params, so switching one doesn't drop the others.
  const keepForColor: Record<string, string> = {};
  const keepForManager: Record<string, string> = {};
  if (range) {
    keepForColor.notifFrom = keepForManager.notifFrom = range.from;
    keepForColor.notifTo = keepForManager.notifTo = range.to;
  }
  if (manager) keepForColor.manager = manager;
  if (color) keepForManager.color = color;

  const [items, ranged, managers] = await Promise.all([
    listVenueNotifications(supabase, venueId, 50, undefined, color ?? undefined, manager ?? undefined),
    range
      ? listVenueNotifications(
          supabase, venueId, 200,
          { from: startOfDaySkopjeIso(range.from), to: endOfDaySkopjeIso(range.to) },
          color ?? undefined, manager ?? undefined,
        )
      : Promise.resolve(null),
    listManagers(venueId),
  ]);
  const today = todayIn();
  const managerNames = managers.map((m) => m.name);

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
        <NotificationsList
          items={items}
          today={today}
          legend={{ active: color, params: keepForColor }}
          managerFilter={managerNames.length > 1 ? { active: manager, options: managerNames, params: keepForManager } : undefined}
        />
      </section>
    </div>
  );
}
