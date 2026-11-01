"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VENUE_TIME_ZONE } from "@/lib/date";
import { COUPLE_LEGEND, coupleKindColor, type NotificationColor } from "@/lib/notification-colors";
import type { CoupleNotification } from "@/lib/couple/notifications";

const TIME = new Intl.DateTimeFormat("mk-MK", { hour: "2-digit", minute: "2-digit", timeZone: VENUE_TIME_ZONE });
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

function Legend({ active }: { active: NotificationColor | null }) {
  return (
    <nav className="notif-legend" aria-label="Филтер по боја">
      <Link href={BASE_PATH} aria-current={active === null ? "true" : undefined}>Сите</Link>
      {COUPLE_LEGEND.map((l) => (
        <Link key={l.color} href={`${BASE_PATH}?color=${l.color}`} className={`notif-chip notif-${l.color}`} aria-current={active === l.color ? "true" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Известувања for the couple: venue changes, guest replies and reminders, grouped by the venue's local day. */
export function CoupleNotificationsList({ items, active }: { items: CoupleNotification[]; active: NotificationColor | null }) {
  // Newest unseen change per section (items are newest first), so a late arrival stays unseen.
  const newestUnseen = new Map<string, string>();
  for (const n of items) {
    if (n.kind === "venue_change" && n.unseen && n.section && !newestUnseen.has(n.section)) newestUnseen.set(n.section, n.at);
  }
  const days = new Map<string, CoupleNotification[]>();
  for (const n of items) {
    const day = ISO_DAY.format(new Date(n.at));
    days.set(day, [...(days.get(day) ?? []), n]);
  }
  return (
    <div className="s3-notifications">
      <Legend active={active} />
      {items.length === 0 ? <p className="ev-hint" style={{ padding: 20 }}>Нема известувања.</p> : null}
      {Array.from(days, ([day, list]) => (
        <section key={day}>
          <h3 className="s3-notif-day">{dayHeading(day)}</h3>
          <ul>
            {list.map((n) => (
              <li key={n.id} className={`plan-row notif-${coupleKindColor(n.kind)}`}>
                <span className="plan-dot" style={{ background: "transparent" }} />
                <span className="plan-time">{TIME.format(new Date(n.at))}</span>
                <span className="plan-name">
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
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
