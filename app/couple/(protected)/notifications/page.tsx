import { headers } from "next/headers";
import { listCoupleNotifications } from "@/lib/couple/notifications";
import { coupleKindColor, isNotificationColor } from "@/lib/notification-colors";
import { CoupleNotificationsList } from "@/components/couple/CoupleNotificationsList";

export const dynamic = "force-dynamic";

export default async function CoupleNotificationsPage({ searchParams }: { searchParams: Promise<{ color?: string | string[] }> }) {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const { color: rawColor } = await searchParams;
  // An unknown colour shows everything.
  const color = isNotificationColor(rawColor) ? rawColor : null;
  const all = await listCoupleNotifications(eventId);
  const items = color ? all.filter((n) => coupleKindColor(n.kind) === color) : all;

  return (
    <div className="wrap">
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Известувања</h2>
          <span className="count">{items.length}</span>
        </div>
        <CoupleNotificationsList items={items} active={color} />
      </section>
    </div>
  );
}
