"use client";

import { useState } from "react";
import type { Guest, GuestSide } from "@/lib/couple/guests";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { reminderMessage, shareLinks } from "@/lib/couple/invite-share";
import { isoToSkopjeLocal, skopjeLocalToIso } from "@/lib/skopje-time";
import { guestLink, useOrigin, type ShareContext } from "@/components/couple/guests/InviteSend";

/** Mirrors lib/couple/reminders `Reminder` (a server-only module). */
export interface ReminderView {
  sendAt: string;
  status: "scheduled" | "sending" | "sent" | "cancelled";
  isDefault: boolean;
  sentAt: string | null;
  sentCount: number;
}

function formatSkopje(iso: string): string {
  return new Intl.DateTimeFormat("mk-MK", {
    timeZone: "Europe/Skopje",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

/**
 * A10: the reminder email to guests who said yes or "later" (default 15 days
 * before at 10:00), and the guests to remind by hand: those without email,
 * or everyone while email sending is off.
 */
export function ReminderPanel({
  initial,
  guests,
  share,
  organizerSide,
}: {
  initial: ReminderView;
  guests: Guest[];
  share: ShareContext;
  organizerSide: GuestSide | null;
}) {
  const origin = useOrigin();
  const [reminder, setReminder] = useState(initial);
  const [when, setWhen] = useState(isoToSkopjeLocal(initial.sendAt));
  const [enabled, setEnabled] = useState(initial.status !== "cancelled");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = reminder.status === "sent" || reminder.status === "sending";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const updated: ReminderView = await jsonOrThrow(
        await fetch("/api/couple/reminder", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ send_at: skopjeLocalToIso(when), enabled }),
        }),
      );
      setReminder(updated);
      setNotice("Потсетникот е зачуван.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на потсетникот.");
    }
  }

  const toRemind = guests.filter(
    (g) =>
      (g.rsvp_status === "confirmed" || g.rsvp_status === "later") &&
      (!share.emailEnabled || !g.email) &&
      (!organizerSide || g.side === organizerSide),
  );

  return (
    <section className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 className="panel-t" style={{ margin: 0 }}>
        Потсетник до гостите
      </h2>
      <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)" }}>
        Email до гостите што потврдиле или ќе одговорат подоцна
        {reminder.isDefault ? " — стандардно 15 дена пред настанот во 10:00." : "."}
      </p>

      {done ? (
        <p style={{ margin: 0, fontSize: 14 }}>
          {reminder.status === "sent" && reminder.sentAt
            ? `Испратен ${formatSkopje(reminder.sentAt)} до ${reminder.sentCount} гости.`
            : "Потсетникот се праќа."}
        </p>
      ) : (
        <form onSubmit={save} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <input
            type="datetime-local"
            aria-label="Кога да се прати потсетникот"
            className="fld"
            style={{ width: "auto" }}
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            required
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Прати потсетник по email
          </label>
          <button type="submit" className="btn btn-ghost">
            Зачувај потсетник
          </button>
        </form>
      )}
      {!share.emailEnabled ? (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--warn)" }}>
          Праќањето email не е вклучено: потсетникот ќе замине кога ќе се вклучи. Дотогаш потсетете ги гостите рачно.
        </p>
      ) : null}
      {notice ? <p style={{ margin: 0, fontSize: 13.5, color: "var(--ok)" }}>{notice}</p> : null}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 13.5, color: "var(--bad)" }}>
          {error}
        </p>
      ) : null}

      {share.slug && toRemind.length > 0 ? (
        <>
          <h3 style={{ fontSize: 14, margin: "6px 0 0" }}>Прати рачно ({toRemind.length})</h3>
          <ul aria-label="Прати рачно" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {toRemind.map((g) => {
              const links = shareLinks(
                g.phone,
                reminderMessage({
                  guestName: g.full_name,
                  coupleNames: share.coupleNames,
                  eventDate: share.eventDate,
                  venueName: share.venueName,
                  eventType: share.eventType,
                  link: guestLink(share, origin, g),
                }),
              );
              return (
                <li key={g.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <strong style={{ fontWeight: 600 }}>{g.full_name}</strong>
                  <span style={{ display: "flex", gap: 6 }}>
                    <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                      WhatsApp
                    </a>
                    <a href={links.viber} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                      Viber
                    </a>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
