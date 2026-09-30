import Link from "next/link";
import type { VenueNotification } from "@/lib/venue/notifications";
import { VENUE_TIME_ZONE } from "@/lib/date";

const DAY = new Intl.DateTimeFormat("mk-MK", { day: "numeric", month: "long", year: "numeric", timeZone: VENUE_TIME_ZONE });
const TIME = new Intl.DateTimeFormat("mk-MK", { hour: "2-digit", minute: "2-digit", timeZone: VENUE_TIME_ZONE });
const ISO_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: VENUE_TIME_ZONE });

/** Известувања (B9): recent activity grouped by the venue's local day. */
export function NotificationsList({ items, today }: { items: VenueNotification[]; today: string }) {
  if (items.length === 0) {
    return <p className="ev-hint" style={{ padding: 20 }}>Сè уште нема известувања.</p>;
  }
  const days = new Map<string, VenueNotification[]>();
  for (const n of items) {
    const day = ISO_DAY.format(new Date(n.at));
    days.set(day, [...(days.get(day) ?? []), n]);
  }
  return (
    <div className="s3-notifications">
      {Array.from(days, ([day, list]) => (
        <section key={day}>
          <h3 className="s3-notif-day">{day === today ? "Денес" : DAY.format(new Date(`${day}T12:00:00Z`)).replace(/\s*г\.?$/, "")}</h3>
          <ul>
            {list.map((n) => (
              <li key={n.id} className="plan-row">
                <span className="plan-time">{TIME.format(new Date(n.at))}</span>
                <span className="plan-name">
                  {n.eventId ? <Link href={`/venue/events?event=${n.eventId}`}>{n.title}</Link> : <b>{n.title}</b>}
                  {n.detail ? <span>{n.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
