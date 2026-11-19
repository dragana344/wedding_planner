"use client";

import { useCallback, useEffect, useState } from "react";
import { diffMenuNumbers, estimateNote, NO_MEAL_LABEL, sentHeadcount, sentMenus, type AllergyNoteGroup, type MenuNumbers, type MenuSubmission } from "@/lib/menu-numbers";
import { formatVenueDateTime } from "@/lib/date";
import type { TimelineStage } from "@/lib/menu-timeline";

type State = {
  current: MenuNumbers;
  notDone: { id: string; full_name: string; people?: number }[];
  /** 0182: who answered so far, and the estimate prefilled for the rest. */
  answers?: { answeredGuests: number; answeredPeople: number; unansweredGuests: number; unansweredPeople: number };
  prefill?: Record<string, number>;
  /** Done, confirmed guests' allergy notes by menu — reference for the summary box below. */
  allergyNotes: AllergyNoteGroup[];
  latest: MenuSubmission | null;
  changedSinceLatest: boolean;
  /** 0184: what moved per menu, a sent estimate's remaining part counted in (older servers: left out). */
  changesSinceLatest?: { name: string; from: number; to: number }[];
  /** Where the event stands on the final-numbers timeline. */
  stage?: TimelineStage;
  /** Whether the "send the final numbers" banner shows (late events skip it). */
  coupleReminder?: boolean;
};

/** "5.10.2026 9:05" style → "05.10.2026 09:05". */
function sentAtLabel(iso: string): string {
  const [date = "", time = ""] = formatVenueDateTime(iso, { time: true }).split(" ");
  const pad = (n: string) => n.padStart(2, "0");
  return `${date.split(".").map(pad).join(".")} ${time}`;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);
const guestsWord = (n: number) => (n === 1 ? "гостин" : "гости");
const withEstimate = (n: number, estimated: number) => (estimated > 0 ? `${n} (${estimateNote(estimated)})` : String(n));

/** "Одговориле: 120 гости (200 лица) · Без одговор: 12 гости" */
export function answersLine(a: NonNullable<State["answers"]>): string {
  return `Одговориле: ${a.answeredGuests} ${guestsWord(a.answeredGuests)} (${a.answeredPeople} лица) · Без одговор: ${a.unansweredGuests} ${guestsWord(a.unansweredGuests)}`;
}

/** The main couple login sends the menu numbers to the venue; the stats prop changing re-reads them. */
export function MenuNumbersSend({ refreshKey }: { refreshKey?: unknown }) {
  const [state, setState] = useState<State | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [allergySummary, setAllergySummary] = useState("");
  // The unanswered guests' part per menu, as typed (prefilled when the dialog opens).
  const [estimate, setEstimate] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/couple/menu-numbers");
      if (!res.ok) return;
      const data = (await res.json()) as State;
      if (Array.isArray(data?.current?.menus) && Array.isArray(data.notDone) && Array.isArray(data.allergyNotes)) setState(data);
    } catch {
      // Nothing to show without the numbers; the guest list works regardless.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/couple/menu-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allergy_summary: allergySummary.trim() || null,
          ...(needsEstimate ? { estimate: Object.fromEntries(Object.entries(estimate).map(([id, v]) => [id, Math.max(0, Math.floor(Number(v) || 0))])) } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Не успеа испраќањето на бројките.");
      setConfirming(false);
      setAllergySummary("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не успеа испраќањето на бројките.");
      // The refusal usually means the numbers moved on: show the current list.
      await load();
    } finally {
      setBusy(false);
    }
  }

  function openConfirm() {
    const prefill = state?.prefill ?? {};
    // Only prefilled while someone hasn't answered; one who stops being done
    // while the dialog is open leaves the fields empty (the send waits for them).
    setEstimate(state && state.notDone.length > 0 ? Object.fromEntries(state.current.menus.map((m) => [m.id, String(prefill[m.id] ?? 0)])) : {});
    setConfirming(true);
  }

  const needsEstimate = (state?.notDone.length ?? 0) > 0;
  if (!state || state.current.menus.length === 0) return null;
  const { current, notDone, allergyNotes, latest, changedSinceLatest, answers } = state;
  const estimateBad = needsEstimate && current.menus.some((m) => !/^\d+$/.test((estimate[m.id] ?? "").trim()));
  const estimated = (id: string) => (needsEstimate ? Number(estimate[id]) || 0 : 0);
  // What would go out: real counts plus the typed estimate, marked.
  const preview = { numbers: current, estimate: needsEstimate ? { menus: current.menus.map((m) => ({ id: m.id, name: m.name, count: estimated(m.id) })), total: current.menus.reduce((sum, m) => sum + estimated(m.id), 0) } : null };
  const previewEstimate = preview.estimate?.total ?? 0;
  // 25..16 days out with nothing sent: the venue is waiting for the numbers.
  const remind = !latest && state.coupleReminder === true;
  const changes = latest && changedSinceLatest ? (state.changesSinceLatest ?? diffMenuNumbers(latest.numbers, current)) : [];

  return (
    <div className="guests-summary-send">
      {remind ? <p role="status" className="guests-summary-menu"><b>Испратете ги конечните бројки до салата</b></p> : null}
      {answers ? <p className="guests-summary-menu">{answersLine(answers)}</p> : null}
      {latest ? (
        <p className="guests-summary-menu">
          {`Испратено на ${sentAtLabel(latest.sentAt)}: ${sentHeadcount(latest)} лица`}
          {latest.estimate ? ` (${estimateNote(latest.estimate.total)})` : ""}
        </p>
      ) : null}
      {changedSinceLatest ? (
        <p role="status" className="guests-summary-menu">
          <b>Бројките се променети по испраќањето — испратете ги повторно</b>
          {changes.length > 0 ? ` (${changes.map((c) => `${c.name} ${signed(c.to - c.from)}`).join(", ")})` : ""}
        </p>
      ) : null}
      {needsEstimate ? (
        <details className="guests-summary-wait">
          <summary>{`Чекаме одговор од ${notDone.length} ${guestsWord(notDone.length)} — можете да ги испратите бројките со проценка за нив`}</summary>
          <p className="guests-summary-menu">{`Без одговор: ${notDone.map((g) => g.full_name).join(", ")}`}</p>
        </details>
      ) : null}

      {confirming ? (
        <div role="group" aria-label="Потврда за испраќање">
          {needsEstimate ? (
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 10px" }}>
              <legend className="guests-summary-menu">
                <b>{`Проценка за ${notDone.length} ${guestsWord(notDone.length)} без одговор (околу ${answers?.unansweredPeople ?? notDone.length} лица)`}</b>
              </legend>
              {current.menus.map((m) => (
                <label key={m.id} style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0" }}>
                  <span style={{ flex: 1 }}>{m.name}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    aria-label={`Проценка: ${m.name}`}
                    value={estimate[m.id] ?? ""}
                    onChange={(e) => setEstimate((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    style={{ width: 80 }}
                  />
                </label>
              ))}
              <p className="guests-summary-menu">Салата ќе ја види проценката посебно означена.</p>
            </fieldset>
          ) : null}
          <ul>
            {sentMenus(preview).map((m) => (
              <li key={m.id}>{`${m.name}: ${withEstimate(m.count, m.estimated)}`}</li>
            ))}
            {(current.noMeal ?? 0) > 0 ? <li>{`${NO_MEAL_LABEL}: ${current.noMeal}`}</li> : null}
          </ul>
          <p>{`Вкупно оброци: ${withEstimate(current.total + previewEstimate, previewEstimate)}`}</p>
          <p>{`Вкупно лица: ${withEstimate(sentHeadcount(preview), previewEstimate)}`}</p>
          {allergyNotes.length > 0 ? (
            <div style={{ margin: "10px 0" }}>
              <p className="guests-summary-menu">
                <b>Алергии кај гостите</b>
              </p>
              <ul>
                {allergyNotes.map((g) => (
                  <li key={g.menuId}>
                    {g.menuName}: {g.notes.map((n) => `${n.guestName} — ${n.text}`).join("; ")}
                  </li>
                ))}
              </ul>
              <label htmlFor="menu-numbers-allergy-summary" className="guests-summary-menu" style={{ display: "block", marginTop: 6 }}>
                Резиме за салата (пр. „3 класично без кашкавал, 2 посно без риба“) — незадолжително
              </label>
              <textarea
                id="menu-numbers-allergy-summary"
                value={allergySummary}
                onChange={(e) => setAllergySummary(e.target.value)}
                rows={3}
                maxLength={2000}
                style={{ width: "100%" }}
              />
              <p className="guests-summary-menu">
                {allergySummary.trim()
                  ? "Салата ќе го добие ова резиме."
                  : "Ако го оставите празно, салата ќе ги добие белешките на гостите погоре, онака како што се внесени."}
              </p>
            </div>
          ) : null}
          <button type="button" className="btn btn-primary" disabled={busy || estimateBad} onClick={() => void send()}>
            Потврди и испрати
          </button>{" "}
          <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>
            Откажи
          </button>
        </div>
      ) : !latest || changedSinceLatest ? (
        <button type="button" className="btn btn-primary" onClick={openConfirm}>
          {latest ? "Испрати повторно" : "Испрати ги бројките до салата"}
        </button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
