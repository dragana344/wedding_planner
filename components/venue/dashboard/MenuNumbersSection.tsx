"use client";

import { useState } from "react";
import { diffMenuNumbers, estimateNote, hasUnseenMenuNumbers, NO_MEAL_LABEL, sentHeadcount, sentMeals, sentMenus } from "@/lib/menu-numbers";
import type { EventChange } from "@/lib/changes/types";
import { ChangeBox } from "./ChangeBox";
import { formatVenueDatePadded, todayIn, VENUE_TIME_ZONE } from "@/lib/date";
import { timelineStage } from "@/lib/menu-timeline";
import { remindCoupleViaApi } from "@/lib/venue/changes-client";
import { EnterMenuNumbers } from "./EnterMenuNumbers";
import { markMenuNumbersSeenViaApi, NewerMenuNumbersError } from "@/lib/venue/menu-numbers-client";
import { errorMessage } from "@/lib/venue/user-error";
import type { EventDetail } from "@/lib/venue/events";

/**
 * The numbers the couple sent the venue (or that went out automatically / were
 * typed by the venue); a manager confirms a new sending with Видено, and may
 * remind the couple or enter the numbers while none are sent.
 */
export function MenuNumbersSection({
  eventId,
  menuNumbers,
  eventDate,
  createdAt,
  menus,
  lastReminderAt,
  couplePhone = null,
  canConfirm,
  token,
  onChanged,
  menuChoicePending = 0,
  numbersChanges = [],
  onChangesSeen,
}: {
  eventId: string;
  menuNumbers: EventDetail["menuNumbers"];
  eventDate: string;
  createdAt: string;
  menus: EventDetail["menus"];
  lastReminderAt: string | null;
  /** The couple's phone, for a manager only (never pass it for plain staff). */
  couplePhone?: string | null;
  canConfirm: boolean;
  token: string | null;
  onChanged: () => void;
  /** 0181: confirmed guests who still have to choose their menus (e.g. after the event's menus changed). */
  menuChoicePending?: number;
  /** 0182: the couple's numbers moved after the last sending ("Промена по испратените бројки"), unseen. */
  numbersChanges?: EventChange[];
  onChangesSeen?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remindedAt, setRemindedAt] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const { latest, previous } = menuNumbers;
  const unseen = hasUnseenMenuNumbers(menuNumbers);
  const diff = unseen && latest && previous ? diffMenuNumbers(previous.numbers, latest.numbers) : [];

  const today = todayIn(VENUE_TIME_ZONE);
  const isPast = eventDate < today;
  const stage = timelineStage({ eventDate, createdDate: todayIn(VENUE_TIME_ZONE, new Date(createdAt)), today, sent: latest !== null });
  const showWarning = latest === null && (stage === "venue_can_remind" || stage === "auto_send" || stage === "too_late_for_auto");
  const reminder = remindedAt ?? lastReminderAt;
  const remindedToday = reminder !== null && todayIn(VENUE_TIME_ZONE, new Date(reminder)) === today;
  const canEnter = canConfirm && !isPast && menus.length > 0;

  async function handleRemind() {
    setBusy(true);
    setError("");
    try {
      const { remindedAt: at } = await remindCoupleViaApi(eventId, token);
      setRemindedAt(at);
    } catch (err) {
      setError(errorMessage(err, "Не успеа потсетувањето."));
    } finally {
      setBusy(false);
    }
  }

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
    <fieldset className={numbersChanges.length > 0 ? "ev-fieldset ev-changed" : "ev-fieldset"}>
      <legend className="lab-s">Бројки за мени</legend>
      {numbersChanges.length > 0 ? (
        <>
          <p role="status" className="ev-hint" style={{ margin: "0 0 4px" }}>
            <b>Промена по испратените бројки</b>
          </p>
          <ChangeBox eventId={eventId} section="numbers" changes={numbersChanges} canConfirm={canConfirm} token={token} onSeen={onChangesSeen ?? onChanged} />
        </>
      ) : null}
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
            {sentMenus(latest).map((m) => (
              <li key={m.id}>
                {m.name} — {m.count}
                {m.estimated > 0 ? ` (${estimateNote(m.estimated)})` : ""}
              </li>
            ))}
            {(latest.numbers.noMeal ?? 0) > 0 ? (
              <li>
                {NO_MEAL_LABEL} — {latest.numbers.noMeal}
              </li>
            ) : null}
          </ul>
          <p style={{ margin: "6px 0 0" }}>
            <b>Вкупно оброци — {sentMeals(latest)}</b>
            {latest.estimate ? ` (${estimateNote(latest.estimate.total)})` : ""}
          </p>
          {(latest.numbers.noMeal ?? 0) > 0 ? (
            <p style={{ margin: "2px 0 0" }}>
              Вкупно лица — {sentHeadcount(latest)}
            </p>
          ) : null}
          {latest.allergySummary ? (
            <p className="ev-hint" style={{ marginTop: 6 }}>
              <b>Алергии:</b> {latest.allergySummary}
            </p>
          ) : latest.allergyNotes && latest.allergyNotes.length > 0 ? (
            <div style={{ marginTop: 6 }}>
              <p className="ev-hint" style={{ margin: 0 }}>
                <b>Алергии (белешки на гостите):</b>
              </p>
              {latest.allergyNotes.map((g) => (
                <p className="ev-hint" key={g.menuId} style={{ margin: 0 }}>
                  {g.menuName}: {g.notes.map((n) => `${n.guestName} — ${n.text}`).join("; ")}
                </p>
              ))}
            </div>
          ) : null}
          {latest.source === "auto" ? (
            <p className="ev-hint">
              Испратено автоматски — непотполно
              {latest.unanswered !== null ? ` · ${latest.unanswered} гости без одговор` : ""}
              {latest.estimate ? " · за нив е пресметана проценка" : ""}
            </p>
          ) : latest.source === "venue" ? (
            <p className="ev-hint">Внесено од салата</p>
          ) : (
            <p className="ev-hint">
              Испратено на {formatVenueDatePadded(latest.sentAt)} од {latest.sentBy}
              {latest.estimate && latest.unanswered ? ` · ${latest.unanswered} гости без одговор, со проценка` : ""}
            </p>
          )}
          <p style={{ margin: "8px 0 0" }}>
            <a className="btn btn-ghost" href={`/venue/events/${eventId}/print/kitchen`} target="_blank" rel="noreferrer">
              Лист за кујна
            </a>
          </p>
        </>
      ) : (
        <p className="ev-hint">Парот сè уште не ги испратил бројките.</p>
      )}
      {menuChoicePending > 0 && menus.length > 1 ? (
        <p role="status" className="ev-hint" style={{ marginTop: 8 }}>
          <b>{menuChoicePending === 1 ? "1 гостин уште треба да избере мени." : `${menuChoicePending} гости уште треба да изберат мени.`}</b>
        </p>
      ) : null}
      {showWarning ? (
        <div role="status" className="change-box" style={{ marginTop: 10 }}>
          <b>Бројките уште не се испратени</b>
          {couplePhone ? <div>Телефон на парот: {couplePhone}</div> : null}
          {reminder !== null ? <div>Потсетено на {formatVenueDatePadded(reminder)}</div> : null}
          {canConfirm && !remindedToday ? (
            <button type="button" className="btn btn-gold" style={{ marginTop: 8 }} onClick={handleRemind} disabled={busy}>
              Потсети го парот
            </button>
          ) : null}
        </div>
      ) : null}
      {canEnter ? (
        entering ? (
          <EnterMenuNumbers
            eventId={eventId}
            menus={menus}
            initial={latest ? Object.fromEntries(latest.numbers.menus.map((m) => [m.id, m.count])) : undefined}
            token={token}
            onSaved={() => {
              setEntering(false);
              onChanged();
            }}
          />
        ) : (
          <button type="button" className="btn" style={{ marginTop: 10 }} onClick={() => setEntering(true)}>
            Внеси бројки
          </button>
        )
      ) : null}
      {error ? (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: "8px 0 0" }}>
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
