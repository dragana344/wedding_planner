"use client";

import { useState } from "react";
import type { Guest, GuestSide } from "@/lib/couple/guests";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { reminderMessage, shareLinks } from "@/lib/couple/invite-share";
import { isoToSkopjeLocal, skopjeLocalToIso } from "@/lib/skopje-time";
import { guestLink, useOrigin, type ShareContext } from "@/components/couple/guests/InviteSend";
import { formatVenueDateTime } from "@/lib/date";
import { TimeInput } from "@/components/shared/TimeInput";

/** Mirrors lib/couple/reminders `Reminder` (a server-only module). */
export interface ReminderView {
  sendAt: string;
  status: "scheduled" | "sending" | "sent" | "cancelled";
  isDefault: boolean;
  sentAt: string | null;
  sentCount: number;
}

function formatSkopje(iso: string): string {
  return formatVenueDateTime(iso, { time: true });
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
          <span role="group" aria-label="Кога да се прати потсетникот" style={{ display: "flex", gap: 6 }}>
            <input
              type="date"
              aria-label="Датум на потсетникот"
              className="fld"
              style={{ width: "auto" }}
              value={when.slice(0, 10)}
              onChange={(e) => setWhen(`${e.target.value}T${when.slice(11, 16)}`)}
              required
            />
            <TimeInput
              aria-label="Време на потсетникот"
              className="fld"
              style={{ width: "6.5em" }}
              value={when.slice(11, 16)}
              onChange={(time) => setWhen(`${when.slice(0, 10)}T${time}`)}
              required
            />
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Прати потсетник по email
          </label>
          <p className="ev-hint" style={{ flexBasis: "100%", margin: 0 }}>
            Потсетниците се праќаат еднаш дневно, претпладне. Ако изберете подоцнежен час, пораката оди следното утро.
          </p>
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
        <details className="cg-remind">
          <summary>Прати рачно ({toRemind.length})</summary>
          <ul aria-label="Прати рачно" className="cg-remind-list">
            {toRemind.map((g) => {
              const links = shareLinks(
                g.phone,
                reminderMessage({
                  guestName: g.full_name,
                  coupleNames: share.coupleNames,
                  eventDate: share.eventDate,
                  venueName: share.venueName,
                  eventType: share.eventType,
                  menuCount: share.menuCount,
                  link: guestLink(share, origin, g),
                }),
              );
              return (
                <li key={g.id}>
                  <strong>{g.full_name}</strong>
                  <span className="cg-remind-links">
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
        </details>
      ) : null}
    </section>
  );
}
