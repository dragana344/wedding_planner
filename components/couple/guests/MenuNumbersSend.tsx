"use client";

import { useCallback, useEffect, useState } from "react";
import { diffMenuNumbers, type MenuNumbers, type MenuSubmission } from "@/lib/menu-numbers";
import { formatVenueDateTime } from "@/lib/date";

type State = {
  current: MenuNumbers;
  notDone: { id: string; full_name: string }[];
  latest: MenuSubmission | null;
  changedSinceLatest: boolean;
};

/** "5.10.2026 9:05" style → "05.10.2026 09:05". */
function sentAtLabel(iso: string): string {
  const [date = "", time = ""] = formatVenueDateTime(iso, { time: true }).split(" ");
  const pad = (n: string) => n.padStart(2, "0");
  return `${date.split(".").map(pad).join(".")} ${time}`;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** The main couple login sends the menu numbers to the venue; the stats prop changing re-reads them. */
export function MenuNumbersSend({ refreshKey }: { refreshKey?: unknown }) {
  const [state, setState] = useState<State | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/couple/menu-numbers");
      if (!res.ok) return;
      const data = (await res.json()) as State;
      if (Array.isArray(data?.current?.menus) && Array.isArray(data.notDone)) setState(data);
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
      const res = await fetch("/api/couple/menu-numbers", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Не успеа испраќањето на бројките.");
      setConfirming(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не успеа испраќањето на бројките.");
      // The refusal usually means the numbers moved on: show the current list.
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!state || state.current.menus.length === 0) return null;
  const { current, notDone, latest, changedSinceLatest } = state;
  const blocked = notDone.length > 0;
  const changes = latest && changedSinceLatest ? diffMenuNumbers(latest.numbers, current) : [];

  return (
    <div className="guests-summary-send">
      {latest ? <p className="guests-summary-menu">{`Испратено на ${sentAtLabel(latest.sentAt)}`}</p> : null}
      {changedSinceLatest ? (
        <p className="guests-summary-menu">
          {changes.length > 0
            ? `Има промени од последното испраќање: ${changes.map((c) => `${c.name} ${signed(c.to - c.from)}`).join(", ")}`
            : "Има промени од последното испраќање."}
        </p>
      ) : null}
      {blocked ? (
        <p className="guests-summary-menu">{`За да ги испратите бројките, чекаме одговор од: ${notDone.map((g) => g.full_name).join(", ")}`}</p>
      ) : null}

      {confirming ? (
        <div role="group" aria-label="Потврда за испраќање">
          <ul>
            {current.menus.map((m) => (
              <li key={m.id}>{`${m.name}: ${m.count}`}</li>
            ))}
          </ul>
          <p>{`Вкупно: ${current.total}`}</p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void send()}>
            Потврди и испрати
          </button>{" "}
          <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(false)}>
            Откажи
          </button>
        </div>
      ) : !latest || changedSinceLatest ? (
        <button type="button" className="btn btn-primary" disabled={blocked} onClick={() => setConfirming(true)}>
          {latest ? "Испрати ажурирани бројки" : "Испрати ги бројките до салата"}
        </button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
