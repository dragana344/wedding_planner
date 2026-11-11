import { headers } from "next/headers";
import { listCoupleNotifications } from "@/lib/couple/notifications";
import { countByColor, coupleKindColor, isNotificationColor } from "@/lib/notification-colors";
import { CoupleNotificationsList } from "@/components/couple/CoupleNotificationsList";

export const dynamic = "force-dynamic";

export default async function CoupleNotificationsPage({ searchParams }: { searchParams: Promise<{ color?: string | string[] }> }) {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const { color: rawColor } = await searchParams;
  // An unknown colour shows everything.
  const color = isNotificationColor(rawColor) ? rawColor : null;
  const all = await listCoupleNotifications(eventId);
  const items = color ? all.filter((n) => coupleKindColor(n.kind) === color) : all;

  const counts = countByColor(all.map((n) => coupleKindColor(n.kind)));

  return (
    <div className="wrap">
      <CoupleNotificationsList items={items} active={color} counts={counts} />
    </div>
  );
}
