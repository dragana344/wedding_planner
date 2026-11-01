import Link from "next/link";
import type { VenueNotification } from "@/lib/venue/notifications";
import { VENUE_TIME_ZONE } from "@/lib/date";
import { VENUE_LEGEND, type NotificationColor } from "@/lib/notification-colors";
import { NotificationSeenButton } from "@/components/venue/dashboard/NotificationSeenButton";

const DAY = new Intl.DateTimeFormat("mk-MK", { day: "numeric", month: "long", year: "numeric", timeZone: VENUE_TIME_ZONE });
const TIME = new Intl.DateTimeFormat("mk-MK", { hour: "2-digit", minute: "2-digit", timeZone: VENUE_TIME_ZONE });
const ISO_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: VENUE_TIME_ZONE });

const BASE_PATH = "/venue/notifications";

function legendHref(params: Record<string, string>, color?: NotificationColor): string {
  const qs = new URLSearchParams(params);
  if (color) qs.set("color", color);
  const text = qs.toString();
  return text ? `${BASE_PATH}?${text}` : BASE_PATH;
}

/** The colour legend; each chip filters the list by that colour (other params, like the range, are kept). */
function Legend({ active, params }: { active: NotificationColor | null; params: Record<string, string> }) {
  return (
    <nav className="notif-legend" aria-label="Филтер по боја">
      <Link href={legendHref(params)} aria-current={active === null ? "true" : undefined}>Сите</Link>
      {VENUE_LEGEND.map((l) => (
        <Link key={l.color} href={legendHref(params, l.color)} className={`notif-chip notif-${l.color}`} aria-current={active === l.color ? "true" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Известувања (B9): recent activity grouped by the venue's local day. With
 * `legend`, the colour legend (filter links) is shown on top.
 */
export function NotificationsList({
  items,
  today,
  legend,
}: {
  items: VenueNotification[];
  today: string;
  legend?: { active: NotificationColor | null; params: Record<string, string> };
}) {
  const legendNav = legend ? <Legend active={legend.active} params={legend.params} /> : null;
  if (items.length === 0) {
    return (
      <>
        {legendNav}
        <p className="ev-hint" style={{ padding: 20 }}>Сè уште нема известувања.</p>
      </>
    );
  }
  const days = new Map<string, VenueNotification[]>();
  for (const n of items) {
    const day = ISO_DAY.format(new Date(n.at));
    days.set(day, [...(days.get(day) ?? []), n]);
  }
  return (
    <div className="s3-notifications">
      {legendNav}
      {Array.from(days, ([day, list]) => (
        <section key={day}>
          <h3 className="s3-notif-day">{day === today ? "Денес" : DAY.format(new Date(`${day}T12:00:00Z`)).replace(/\s*г\.?$/, "")}</h3>
          <ul>
            {list.map((n) => (
              <li key={n.id} className={`plan-row notif-${n.color}`}>
                {/* .plan-row is a 4-column grid (dot/time/name/status, see
                    DashboardClient's "Дневен план"); without this spacer the
                    time and name get auto-placed into the grid's narrow
                    first two columns instead, overlapping each other. */}
                <span className="plan-dot" style={{ background: "transparent" }} />
                <span className="plan-time">{TIME.format(new Date(n.at))}</span>
                <span className="plan-name">
                  {n.eventId ? <Link href={`/venue/events?event=${n.eventId}`}>{n.title}</Link> : <b>{n.title}</b>}
                  {n.detail ? <span>{n.detail}</span> : null}
                </span>
                {n.unseen ? (
                  <span className="notif-unseen">
                    <span className="notif-badge">Не е видено</span>
                    {n.seenAction ? <NotificationSeenButton action={n.seenAction} /> : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
