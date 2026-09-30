import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listVenueNotifications } from "@/lib/venue/notifications";
import { todayIn } from "@/lib/date";
import { NotificationsList } from "@/components/venue/dashboard/NotificationsList";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;
  const items = await listVenueNotifications(supabase, venueId);
  return (
    <div className="wrap">
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Известувања</h2>
          <span className="count">последни {items.length}</span>
        </div>
        <NotificationsList items={items} today={todayIn()} />
      </section>
    </div>
  );
}
