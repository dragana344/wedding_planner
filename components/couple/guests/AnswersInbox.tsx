"use client";

import { useEffect, useState } from "react";
import type { Guest } from "@/lib/couple/guests";
import { STATUS_LABELS } from "@/lib/couple/guest-labels";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import { formatVenueDateTime } from "@/lib/date";
import { REVIEW_REASON_LABELS, SOURCE_LABELS, describeChanges, overInvited, overInvitedLabel, type InboxAnswer } from "@/lib/couple/rsvp-answer-view";

const ANSWER_LABELS: Record<InboxAnswer["status"], string> = STATUS_LABELS;

/** "3 лица (1 дете) · Месо 2, Посно 1" for a yes; "" otherwise. */
function partyText(a: InboxAnswer, menus: { id: string; name: string }[]): string {
  if (a.status !== "confirmed" || a.partySize === null) return "";
  const people = a.partySize === 1 ? "1 лице" : `${a.partySize} лица`;
  const children = a.childrenCount > 0 ? ` (${a.childrenCount} ${a.childrenCount === 1 ? "дете" : "деца"})` : "";
  const menuParts = menus.length > 1 ? menus.filter((m) => (a.menuCounts[m.id] ?? 0) > 0).map((m) => `${m.name} ${a.menuCounts[m.id]}`) : [];
  if ((a.noMealCount ?? 0) > 0) menuParts.push(`Деца без оброк ${a.noMealCount}`);
  return `${people}${children}${menuParts.length > 0 ? ` · ${menuParts.join(", ")}` : ""}`;
}

/** The answer's own details, shared by pending and applied cards. */
function AnswerDetails({ answer, menus }: { answer: InboxAnswer; menus: { id: string; name: string }[] }) {
  const party = partyText(answer, menus);
  return (
    <>
      <p className="cg-meta">
        {ANSWER_LABELS[answer.status]}
        {party ? ` · ${party}` : ""}
      </p>
      {answer.householdNames.length > 0 ? <p className="cg-meta">Со: {answer.householdNames.join(", ")}</p> : null}
      {answer.allergies ? <p className="cg-meta">Алергии: {answer.allergies}</p> : null}
      {answer.comment ? <p className="cg-meta">„{answer.comment}“</p> : null}
      <p className="cg-meta cg-small">
        {formatVenueDateTime(answer.createdAt, { time: true })} · {SOURCE_LABELS[answer.source]}
        {answer.phone ? ` · ${answer.phone}` : ""}
      </p>
    </>
  );
}

/** One pending answer with the couple's three choices. */
function PendingAnswer({
  answer,
  guests,
  menus,
  onResolved,
}: {
  answer: InboxAnswer;
  guests: Guest[];
  menus: { id: string; name: string }[];
  onResolved: (answerId: string, guest: Guest | null) => void;
}) {
  const suggested = new Set(answer.suggestions.map((s) => s.id));
  const others = guests.filter((g) => !suggested.has(g.id)).sort((a, b) => a.full_name.localeCompare(b.full_name, "mk"));
  const [guestId, setGuestId] = useState(answer.suggestions[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 0184: the chosen guest already has a newer answer — the couple decides.
  const [conflict, setConflict] = useState<{ guestId: string; message: string } | null>(null);

  async function resolve(body: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/couple/rsvp-answers/${answer.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 409 && body.action === "guest") {
        const data = await response.json();
        if (data.conflict) {
          setConflict({ guestId: body.guest_id, message: data.error as string });
          return;
        }
      }
      const result = await jsonOrThrow(response);
      setConflict(null);
      onResolved(answer.id, (result.guest as Guest | null) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа решавањето на одговорот.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cg-row ca-pending">
      <div className="cg-main" style={{ gridColumn: "1 / -1" }}>
        <p className="cg-name" style={{ cursor: "default" }}>
          {answer.fullName}
        </p>
        {answer.reviewReason ? (
          <p className="cg-over" style={{ margin: "2px 0 4px" }}>
            {REVIEW_REASON_LABELS[answer.reviewReason]}
          </p>
        ) : null}
        <AnswerDetails answer={answer} menus={menus} />
        <div className="ca-actions">
          <label className="ca-pick">
            <span className="lab-s">Ова е</span>
            <select
              aria-label={`Чиј е одговорот од ${answer.fullName}`}
              className="fld"
              value={guestId}
              onChange={(e) => {
                setGuestId(e.target.value);
                setConflict(null);
              }}
            >
              <option value="">Изберете гостин…</option>
              {answer.suggestions.length > 0 ? (
                <optgroup label="Најверојатно">
                  {answer.suggestions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="Сите гости">
                {others.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.full_name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <button type="button" className="btn btn-gold" disabled={busy || !guestId} onClick={() => void resolve({ action: "guest", guest_id: guestId })}>
            Потврди
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void resolve({ action: "new" })}>
            Нов гостин
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void resolve({ action: "ignore" })}>
            Игнорирај
          </button>
        </div>
        {conflict ? (
          <div role="alert" className="ca-conflict" style={{ marginTop: 8 }}>
            <p className="cg-over" style={{ margin: "0 0 6px" }}>
              {conflict.message}
            </p>
            <div className="ca-actions">
              <button type="button" className="btn btn-gold" disabled={busy} onClick={() => void resolve({ action: "guest", guest_id: conflict.guestId, mode: "apply" })}>
                Примени го сепак
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void resolve({ action: "guest", guest_id: conflict.guestId, mode: "link" })}>
                Само поврзи
              </button>
            </div>
            <p className="cg-meta cg-small" style={{ margin: "4px 0 0" }}>
              „Само поврзи“ го зачувува одговорот кај гостинот без да ги смени неговите бројки.
            </p>
          </div>
        ) : null}
        {error ? (
          <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: "6px 0 0" }}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function AppliedAnswer({ answer, menus }: { answer: InboxAnswer; menus: { id: string; name: string }[] }) {
  const linked = answer.reviewState === "linked";
  const changes = answer.reviewState === "ignored" || linked ? [] : describeChanges(answer.before, answer.after, menus);
  const over = overInvited(answer.status, answer.partySize, answer.invitedPartySize);
  const isNew = answer.match === "new";
  return (
    <div className="cg-row">
      <div className="cg-main" style={{ gridColumn: "1 / -1" }}>
        <p className="cg-name" style={{ cursor: "default" }}>
          {answer.guestName ?? answer.fullName}
          {isNew ? <span className="change-mark">нов гостин од линкот</span> : null}
          {over > 0 ? <span className="cg-over">{overInvitedLabel(over)}</span> : null}
          {answer.reviewState === "ignored" ? <span className="cg-over">Игнорирано</span> : null}
          {linked ? <span className="cg-over">Само поврзано — бројките не се сменети</span> : null}
        </p>
        {answer.guestName && answer.guestName !== answer.fullName ? <p className="cg-meta cg-small">Внесено име: {answer.fullName}</p> : null}
        <AnswerDetails answer={answer} menus={menus} />
        {changes.length > 0 ? <p className="cg-meta ca-changes">{changes.join(" · ")}</p> : null}
      </div>
    </div>
  );
}

/**
 * 0179 "Одговори": every answer the guests (or the couple) gave, newest
 * first, with the "Да се провери" queue on top — shared-link answers the
 * matching was unsure about, resolved with one tap.
 */
export function AnswersInbox({
  guests,
  menus,
  onGuestChanged,
  onPendingChange,
}: {
  guests: Guest[];
  menus: { id: string; name: string }[];
  /** A resolved answer changed (or created) this guest. */
  onGuestChanged: (guest: Guest) => void;
  onPendingChange: (pending: number) => void;
}) {
  const [answers, setAnswers] = useState<InboxAnswer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await jsonOrThrow(await fetch("/api/couple/rsvp-answers"));
      setAnswers(data.answers as InboxAnswer[]);
      onPendingChange(data.pending as number);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа вчитувањето на одговорите.");
    }
  }

  useEffect(() => {
    void load();
    // Loaded once when the tab opens; resolving reloads it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleResolved(_answerId: string, guest: Guest | null) {
    if (guest) onGuestChanged(guest);
    void load();
  }

  if (error) {
    return (
      <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>
        {error}
      </p>
    );
  }
  if (answers === null) return <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>Се вчитува…</p>;

  const pending = answers.filter((a) => a.reviewState === "pending");
  const rest = answers.filter((a) => a.reviewState !== "pending");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {pending.length > 0 ? (
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h2 className="panel-t" style={{ margin: 0 }}>
            Да се провери ({pending.length})
          </h2>
          <p className="cg-meta" style={{ margin: 0 }}>
            Не сме сигурни чии се овие одговори. Сè додека не изберете, не менуваат ниту еден гостин.
          </p>
          {pending.map((a) => (
            <PendingAnswer key={a.id} answer={a} guests={guests} menus={menus} onResolved={handleResolved} />
          ))}
        </section>
      ) : null}
      <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <h2 className="panel-t" style={{ margin: 0 }}>
          Сите одговори
        </h2>
        {rest.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13.5, margin: 0 }}>Сè уште нема одговори.</p>
        ) : (
          rest.map((a) => <AppliedAnswer key={a.id} answer={a} menus={menus} />)
        )}
      </section>
    </div>
  );
}
