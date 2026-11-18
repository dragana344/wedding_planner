"use client";

import { useState } from "react";
import Link from "next/link";
import type { EventRow, OverrideRow } from "@/lib/admin/queries";
import type { FeatureMap } from "@/lib/entitlements/features";
import { FeatureOverridesEditor } from "@/components/admin/FeatureOverridesEditor";
import { ActionButton } from "@/components/admin/ActionButton";
import { updateEvent, saveEventOverride, unlockCoupleLogin, regenerateCouplePassword, extendCoupleAccess } from "@/app/admin/(panel)/events/actions";
import { TimeInput } from "@/components/shared/TimeInput";
import { addMonths, coupleAccessEnd, coupleAccessPhase, type CoupleAccessPhase } from "@/lib/couple/access";
import { formatMkDate, todayIn } from "@/lib/date";

const PHASE_LABELS: Record<CoupleAccessPhase, string> = {
  active: "Активен",
  memories: "Само преглед (по настанот)",
  closed: "Затворен",
};

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
        <AccessEndPanel event={event} />
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
    <form onSubmit={submit} className="adm-inline-form" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", padding: "0 20px 16px" }}>
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
        <TimeInput id="event-start" className="fld" value={startTime} onChange={setStartTime} />
      </div>
      <div>
        <label className="lab-s" htmlFor="event-end">
          Крај
        </label>
        <TimeInput id="event-end" className="fld" value={endTime} onChange={setEndTime} />
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

// 0170: when the couple's access ends and the event's personal data is
// erased. Only the admin can move it; the date is audited.
function AccessEndPanel({ event }: { event: EventRow }) {
  const today = todayIn();
  const [extendedUntil, setExtendedUntil] = useState(event.accessExtendedUntil);
  const accessUntil = extendedUntil ?? event.accessUntil;
  const end = coupleAccessEnd(event.date, accessUntil);
  const [date, setDate] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (event.personalDataErasedAt) {
    return <p style={{ padding: "0 20px 12px" }} className="muted">Личните податоци на настанот се избришани.</p>;
  }

  async function save(until: string | null) {
    setPending(true);
    setMessage(null);
    const result = await extendCoupleAccess({ eventId: event.id, until });
    setPending(false);
    if (result.ok) {
      setExtendedUntil(until);
      setDate("");
      setMessage("Зачувано.");
    } else {
      setMessage(result.error);
    }
  }

  return (
    <div style={{ padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: 8, alignItems: "start" }}>
      <p>
        Пристап до: <strong>{formatMkDate(end)}</strong> · {PHASE_LABELS[coupleAccessPhase(event.date, accessUntil, today)]}
      </p>
      <p className="muted">По овој датум пристапот се затвора и личните податоци се бришат автоматски.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => save(addMonths(end < today ? today : end, 3))}>
          Продолжи пристап +3 месеци
        </button>
        <input aria-label="Нов краен датум" className="fld" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="button" className="btn btn-ghost" disabled={pending || !date} onClick={() => save(date)}>
          Постави датум
        </button>
        {extendedUntil ? (
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => save(null)}>
            Врати стандарден рок
          </button>
        ) : null}
      </div>
      {message ? <span className="muted">{message}</span> : null}
    </div>
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
