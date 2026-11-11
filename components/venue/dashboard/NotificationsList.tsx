"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/venue/shell/Icon";
import type { VenueNotification } from "@/lib/venue/notifications";
import { VENUE_TIME_ZONE, formatMkDate } from "@/lib/date";
import { VENUE_LEGEND, type NotificationColor, type NotificationCounts } from "@/lib/notification-colors";
import { NotificationSeenButton } from "@/components/venue/dashboard/NotificationSeenButton";
import { usePaged } from "@/components/venue/dashboard/ShowMore";

// hourCycle is explicit: Node and browsers don't agree on mk-MK's default
// (24h vs AM/PM), which breaks hydration on this SSR'd list otherwise.
const TIME = new Intl.DateTimeFormat("mk-MK", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: VENUE_TIME_ZONE });
const ISO_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: VENUE_TIME_ZONE });

const BASE_PATH = "/venue/notifications";

function legendHref(params: Record<string, string>, color?: NotificationColor): string {
  const qs = new URLSearchParams(params);
  if (color) qs.set("color", color);
  const text = qs.toString();
  return text ? `${BASE_PATH}?${text}` : BASE_PATH;
}

/** The colour filter pills; each filters the list by that colour (other params, like the range, are kept). */
function Legend({ active, params, counts }: { active: NotificationColor | null; params: Record<string, string>; counts?: NotificationCounts }) {
  return (
    <nav className="nf-filters" aria-label="Филтер по боја">
      <Link href={legendHref(params)} className="nf-pill nf-all" aria-current={active === null ? "true" : undefined}>
        Сите
        {counts ? <span className="nf-count" aria-hidden>{counts.all}</span> : null}
      </Link>
      {VENUE_LEGEND.map((l) => (
        <Link key={l.color} href={legendHref(params, l.color)} className={`nf-pill notif-chip notif-${l.color}`} aria-current={active === l.color ? "true" : undefined}>
          <Icon name={l.icon} size="sm" />
          {l.label}
          {counts ? <span className="nf-count" aria-hidden>{counts[l.color] ?? 0}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

function managerHref(params: Record<string, string>, manager?: string): string {
  const qs = new URLSearchParams(params);
  if (manager) qs.set("manager", manager);
  const text = qs.toString();
  return text ? `${BASE_PATH}?${text}` : BASE_PATH;
}

/** "What did manager X do" — only shown when the venue has more than one manager (0133). */
function ManagerFilter({ active, options, params }: { active: string | null; options: string[]; params: Record<string, string> }) {
  return (
    <nav className="nf-managers" aria-label="Филтер по менаџер">
      <Icon name="user" size="sm" />
      <Link href={managerHref(params)} aria-current={active === null ? "true" : undefined}>Сите менаџери</Link>
      {options.map((name) => (
        <Link key={name} href={managerHref(params, name)} aria-current={active === name ? "true" : undefined}>
          {name}
        </Link>
      ))}
    </nav>
  );
}

const ICON_BY_COLOR = new Map(VENUE_LEGEND.map((l) => [l.color, l.icon]));

/**
 * Известувања (B9): recent activity grouped by the venue's local day, as
 * coloured cards. With `legend`, the colour filter pills (with counts) and
 * the search box are shown on top; with `managerFilter`, so is "what did
 * manager X do" (only passed once the venue has 2+ managers — see the
 * page). `tools` sits at the right end of the search row.
 */
export function NotificationsList({
  items,
  today,
  legend,
  managerFilter,
  tools,
}: {
  items: VenueNotification[];
  today: string;
  legend?: { active: NotificationColor | null; params: Record<string, string>; counts?: NotificationCounts };
  managerFilter?: { active: string | null; options: string[]; params: Record<string, string> };
  tools?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matching = needle
    ? items.filter((n) => `${n.title} ${n.detail ?? ""}`.toLowerCase().includes(needle))
    : items;
  // 10 at a time (newest first); a new colour, manager, range filter or search starts over.
  const page = usePaged(matching, JSON.stringify([legend?.active, legend?.params, managerFilter?.active, needle]));
  const days = new Map<string, VenueNotification[]>();
  for (const n of page.visible) {
    const day = ISO_DAY.format(new Date(n.at));
    days.set(day, [...(days.get(day) ?? []), n]);
  }
  return (
    <div className="nf">
      {legend ? <Legend active={legend.active} params={legend.params} counts={legend.counts} /> : null}
      {legend ? (
        <div className="nf-tools">
          <label className="nf-search">
            <Icon name="search" size="sm" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пребарај известување..." aria-label="Пребарај известување" />
          </label>
          {tools}
        </div>
      ) : null}
      {managerFilter ? <ManagerFilter active={managerFilter.active} options={managerFilter.options} params={managerFilter.params} /> : null}
      {items.length === 0 ? (
        <p className="nf-empty">Сè уште нема известувања.</p>
      ) : matching.length === 0 ? (
        <p className="nf-empty">Нема известувања за „{query.trim()}“.</p>
      ) : null}
      {Array.from(days, ([day, list]) => (
        <section key={day}>
          <h3 className="nf-day">
            {day === today ? null : <Icon name="cal" size="sm" />}
            {day === today ? "Денес" : formatMkDate(day)}
          </h3>
          <ul className="nf-list">
            {list.map((n) => (
              <li key={n.id} className={`nf-row notif-${n.color}${n.unseen ? " is-unseen" : ""}`}>
                <span className="nf-icon">
                  <Icon name={ICON_BY_COLOR.get(n.color) ?? "bell"} />
                </span>
                <span className="nf-body">
                  {n.eventId ? <Link href={`/venue/events?event=${n.eventId}`}>{n.title}</Link> : <b>{n.title}</b>}
                  {n.detail ? <span>{n.detail}</span> : null}
                </span>
                {n.unseen ? (
                  <span className="notif-unseen">
                    <span className="notif-badge">Не е видено</span>
                    {n.seenAction ? <NotificationSeenButton action={n.seenAction} /> : null}
                  </span>
                ) : null}
                <time className="nf-time" dateTime={n.at}>{TIME.format(new Date(n.at))}</time>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {page.showMore}
    </div>
  );
}
