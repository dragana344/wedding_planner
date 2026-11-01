"use client";

import { useState } from "react";
import { enterMenuNumbersViaApi } from "@/lib/venue/changes-client";
import { errorMessage } from "@/lib/venue/user-error";
import type { EventMenu } from "@/lib/venue/events";

/** A manager types the final numbers per menu when the couple has not sent them. */
export function EnterMenuNumbers({
  eventId,
  menus,
  initial,
  token,
  onSaved,
}: {
  eventId: string;
  menus: EventMenu[];
  /** The latest sent counts per menu id, to start from; a missing menu starts at 0. */
  initial?: Record<string, number>;
  token: string | null;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(menus.map((m) => [m.id, String(initial?.[m.id] ?? 0)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const counts: Record<string, number> = {};
    for (const m of menus) {
      const n = Number(values[m.id]);
      if (values[m.id] === "" || !Number.isInteger(n) || n < 0) {
        setError(`Внесете цел број (0 или повеќе) за „${m.name}“.`);
        return;
      }
      counts[m.id] = n;
    }
    setBusy(true);
    setError("");
    try {
      await enterMenuNumbersViaApi(eventId, counts, token);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Не успеа зачувувањето на бројките."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ marginTop: 10 }}>
      <div className="ev-form-grid">
        {menus.map((m) => (
          <div className="ev-field" key={m.id}>
            <label className="lab-s" htmlFor={`enter-numbers-${m.id}`}>
              {m.name}
            </label>
            <input
              id={`enter-numbers-${m.id}`}
              className="fld"
              type="number"
              min={0}
              step={1}
              value={values[m.id] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      {error ? (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: "8px 0 0" }}>
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-gold" style={{ marginTop: 8 }} disabled={busy}>
        Зачувај бројки
      </button>
    </form>
  );
}
