"use client";

import { useState } from "react";
import Link from "next/link";
import type { EventRow, OverrideRow } from "@/lib/admin/queries";
import type { FeatureMap } from "@/lib/entitlements/features";
import { FeatureOverridesEditor } from "@/components/admin/FeatureOverridesEditor";
import { ActionButton } from "@/components/admin/ActionButton";
import { updateEvent, saveEventOverride, unlockCoupleLogin, regenerateCouplePassword } from "@/app/admin/(panel)/events/actions";

const STATUSES: { value: string; label: string }[] = [
  { value: "preparation", label: "Подготовка" },
  { value: "confirmed", label: "Потврден" },
  { value: "in_progress", label: "Во тек" },
  { value: "completed", label: "Завршен" },
  { value: "cancelled", label: "Откажан" },
];

// Full event detail panels (task 3.5): edit date/times/status, per-event
// benefit overrides, and couple-access support (unlock login, regenerate
// password). Same composition pattern as VenueAdminPanels (task 3.3) and
// PlanAdminPanels (task 3.4).
export function EventAdminPanels({ event, overrides, features }: { event: EventRow; overrides: OverrideRow[]; features: FeatureMap }) {
  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">{event.coupleNames}</h2>
        </div>
        <p style={{ padding: "0 20px 16px" }} className="muted">
          Локал: <Link href={`/admin/venues/${event.venueId}`}>{event.venueName}</Link>
        </p>
        <EditForm event={event} />
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Бенефиции за настанот</h2>
        </div>
        <FeatureOverridesEditor scope="event" features={features} overrides={overrides} onSave={(v) => saveEventOverride({ eventId: event.id, ...v })} />
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Пристап на парот</h2>
        </div>
        <CoupleAccessPanel eventId={event.id} />
      </section>
    </>
  );
}

function EditForm({ event }: { event: EventRow }) {
  const [date, setDate] = useState(event.date);
  const [startTime, setStartTime] = useState(event.startTime?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(event.endTime?.slice(0, 5) ?? "");
  const [status, setStatus] = useState(event.status);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaveMessage(null);
    const result = await updateEvent({
      eventId: event.id,
      date,
      startTime: startTime || null,
      endTime: endTime || null,
      status,
    });
    if (result.ok) {
      setSaveMessage("Зачувано.");
    } else {
      // Includes the max_active_events limit refusal (0049's Macedonian
      // P0001 message, e.g. reactivating a cancelled event past the
      // venue's plan limit) — adminAction relays it here unchanged.
      setError(result.error);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", padding: "0 20px 16px" }}>
      <div>
        <label className="lab-s" htmlFor="event-date">
          Датум
        </label>
        <input id="event-date" className="fld" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="lab-s" htmlFor="event-start">
          Почеток
        </label>
        <input id="event-start" className="fld" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </div>
      <div>
        <label className="lab-s" htmlFor="event-end">
          Крај
        </label>
        <input id="event-end" className="fld" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
      </div>
      <div>
        <label className="lab-s" htmlFor="event-status">
          Статус
        </label>
        <select id="event-status" className="fld" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-gold">
        Зачувај
      </button>
      {saveMessage ? <span className="muted"> {saveMessage}</span> : null}
      {error ? <p className="auth-error" style={{ width: "100%" }}>{error}</p> : null}
    </form>
  );
}

function CoupleAccessPanel({ eventId }: { eventId: string }) {
  const [password, setPassword] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function regenerate() {
    if (!window.confirm("Стара лозинка на парот престанува да важи и активните сесии на парот се прекинуваат. Продолжи?")) return;
    setPending(true);
    setError(null);
    setPassword(null);
    const result = await regenerateCouplePassword({ eventId });
    setPending(false);
    if (result.ok) {
      setPassword(result.data.password);
    } else {
      setError(result.error);
    }
  }

  return (
    <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 12, alignItems: "start" }}>
      <ActionButton label="Отклучи најава на парот" action={() => unlockCoupleLogin({ eventId })} />
      <div>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={regenerate}>
          Нова лозинка за парот
        </button>
        {error ? <span className="muted"> {error}</span> : null}
      </div>
      {password ? (
        <div className="panel" style={{ padding: 16, border: "1px solid var(--gold, #b8935f)" }}>
          <p>
            Нова лозинка: <strong>{password}</strong>
          </p>
          <p className="muted">Зачувајте ја сега — нема повторно да се прикаже.</p>
        </div>
      ) : null}
    </div>
  );
}
