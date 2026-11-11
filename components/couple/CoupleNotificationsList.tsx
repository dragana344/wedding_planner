"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VENUE_TIME_ZONE } from "@/lib/date";
import { COUPLE_LEGEND, coupleKindColor, type NotificationColor, type NotificationCounts } from "@/lib/notification-colors";
import { Icon } from "@/components/venue/shell/Icon";
import type { CoupleNotification } from "@/lib/couple/notifications";

// hourCycle is explicit: Node and browsers don't agree on mk-MK's default
// (24h vs AM/PM), which breaks hydration on this SSR'd list otherwise.
const TIME = new Intl.DateTimeFormat("mk-MK", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: VENUE_TIME_ZONE });
const ISO_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: VENUE_TIME_ZONE });

const BASE_PATH = "/couple/notifications";

/** "2028-01-02" -> "02.01.2028" */
function dayHeading(isoDay: string): string {
  const [y, m, d] = isoDay.split("-");
  return `${d}.${m}.${y}`;
}

/** Видено for one venue change: confirms its section up to the newest unseen change of that section on this page. */
function SeenButton({ section, upTo }: { section: string; upTo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newer, setNewer] = useState(false);

  async function handleSeen() {
    setBusy(true);
    setError("");
    setNewer(false);
    try {
      const res = await fetch("/api/couple/changes/seen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section, up_to: upTo }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; newer?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Не успеа означувањето како видено.");
      setNewer(data.newer === true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не успеа означувањето како видено.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="notif-seen">
      <button type="button" className="btn btn-gold" onClick={() => void handleSeen()} disabled={busy}>
        Видено
      </button>
      {newer ? <span role="status">Има нови промени — освежете.</span> : null}
      {error ? <span role="alert">{error}</span> : null}
    </span>
  );
}

function Legend({ active, counts }: { active: NotificationColor | null; counts?: NotificationCounts }) {
  return (
    <nav className="nf-filters" aria-label="Филтер по боја">
      <Link href={BASE_PATH} className="nf-pill nf-all" aria-current={active === null ? "true" : undefined}>
        Сите
        {counts ? <span className="nf-count" aria-hidden>{counts.all}</span> : null}
      </Link>
      {COUPLE_LEGEND.map((l) => (
        <Link key={l.color} href={`${BASE_PATH}?color=${l.color}`} className={`nf-pill notif-chip notif-${l.color}`} aria-current={active === l.color ? "true" : undefined}>
          <Icon name={l.icon} size="sm" />
          {l.label}
          {counts ? <span className="nf-count" aria-hidden>{counts[l.color] ?? 0}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

const ICON_BY_COLOR = new Map(COUPLE_LEGEND.map((l) => [l.color, l.icon]));

/**
 * Известувања for the couple: venue changes, guest replies and reminders,
 * grouped by the venue's local day as coloured cards, with filter pills
 * (counts from `counts`) and a search box on top.
 */
export function CoupleNotificationsList({
  items,
  active,
  counts,
}: {
  items: CoupleNotification[];
  active: NotificationColor | null;
  counts?: NotificationCounts;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const matching = needle ? items.filter((n) => `${n.title} ${n.detail ?? ""}`.toLowerCase().includes(needle)) : items;
  // Newest unseen change per section (items are newest first), so a late arrival stays unseen.
  const newestUnseen = new Map<string, string>();
  for (const n of items) {
    if (n.kind === "venue_change" && n.unseen && n.section && !newestUnseen.has(n.section)) newestUnseen.set(n.section, n.at);
  }
  const days = new Map<string, CoupleNotification[]>();
  for (const n of matching) {
    const day = ISO_DAY.format(new Date(n.at));
    days.set(day, [...(days.get(day) ?? []), n]);
  }
  return (
    <div className="nf">
      <Legend active={active} counts={counts} />
      <div className="nf-tools">
        <label className="nf-search">
          <Icon name="search" size="sm" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пребарај известување..." aria-label="Пребарај известување" />
        </label>
      </div>
      {items.length === 0 ? (
        <p className="nf-empty">Нема известувања.</p>
      ) : matching.length === 0 ? (
        <p className="nf-empty">Нема известувања за „{query.trim()}“.</p>
      ) : null}
      {Array.from(days, ([day, list]) => (
        <section key={day}>
          <h3 className="nf-day">
            <Icon name="cal" size="sm" />
            {dayHeading(day)}
          </h3>
          <ul className="nf-list">
            {list.map((n) => {
              const color = coupleKindColor(n.kind);
              return (
                <li key={n.id} className={`nf-row notif-${color}${n.unseen ? " is-unseen" : ""}`}>
                  <span className="nf-icon">
                    <Icon name={ICON_BY_COLOR.get(color) ?? "bell"} />
                  </span>
                  <span className="nf-body">
                    <b>{n.title}</b>
                    {n.detail ? <span>{n.detail}</span> : null}
                  </span>
                  {n.unseen && n.kind === "venue_change" ? (
                    <span className="notif-unseen">
                      <span className="notif-badge">Не е видено</span>
                      {n.section ? <SeenButton section={n.section} upTo={newestUnseen.get(n.section) ?? n.at} /> : null}
                    </span>
                  ) : null}
                  {n.unseen && n.kind === "guest_reply" ? (
                    <span className="notif-unseen">
                      <span className="notif-badge">Ново</span>
                    </span>
                  ) : null}
                  <time className="nf-time" dateTime={n.at}>{TIME.format(new Date(n.at))}</time>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
