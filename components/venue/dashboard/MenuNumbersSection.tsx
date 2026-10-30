"use client";

import { useState } from "react";
import { diffMenuNumbers, hasUnseenMenuNumbers } from "@/lib/menu-numbers";
import { formatVenueDatePadded } from "@/lib/date";
import { markMenuNumbersSeenViaApi, NewerMenuNumbersError } from "@/lib/venue/menu-numbers-client";
import { errorMessage } from "@/lib/venue/user-error";
import type { EventDetail } from "@/lib/venue/events";

/** The numbers the couple sent the venue; a manager confirms a new sending with Видено. */
export function MenuNumbersSection({
  eventId,
  menuNumbers,
  canConfirm,
  token,
  onChanged,
}: {
  eventId: string;
  menuNumbers: EventDetail["menuNumbers"];
  canConfirm: boolean;
  token: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { latest, previous } = menuNumbers;
  const unseen = hasUnseenMenuNumbers(menuNumbers);
  const diff = unseen && latest && previous ? diffMenuNumbers(previous.numbers, latest.numbers) : [];

  async function handleSeen() {
    if (!latest) return;
    setBusy(true);
    setError("");
    try {
      await markMenuNumbersSeenViaApi(eventId, latest.id, token);
      onChanged();
    } catch (err) {
      if (err instanceof NewerMenuNumbersError) onChanged();
      setError(errorMessage(err, "Не успеа означувањето како видено."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="ev-fieldset">
      <legend className="lab-s">Бројки за мени</legend>
      {latest ? (
        <>
          {unseen ? (
            <div
              role="status"
              style={{ border: "1px solid var(--gold, #b8924a)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}
            >
              <b>Нови бројки од парот</b>
              {diff.map((d) => (
                <div key={d.name}>
                  {d.name}: {d.from} → {d.to}
                </div>
              ))}
              {canConfirm ? (
                <button type="button" className="btn btn-gold" style={{ marginTop: 8 }} onClick={handleSeen} disabled={busy}>
                  Видено
                </button>
              ) : null}
            </div>
          ) : null}
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {latest.numbers.menus.map((m) => (
              <li key={m.id}>
                {m.name} — {m.count}
              </li>
            ))}
          </ul>
          <p style={{ margin: "6px 0 0" }}>
            <b>Вкупно — {latest.numbers.total}</b>
          </p>
          <p className="ev-hint">Испратено на {formatVenueDatePadded(latest.sentAt)} од {latest.sentBy}</p>
          {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
        </>
      ) : (
        <p className="ev-hint">Парот сè уште не ги испратил бројките.</p>
      )}
    </fieldset>
  );
}
