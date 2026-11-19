"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";

export const ESTIMATE_INVALID_ERROR = "Внесете цел број (0 или повеќе).";

/** The couple's typed estimate of the guest count ("Проценка"): click → number
 * input; Enter or ✓ saves, Esc or ✕ cancels. Leaving the field does not save
 * (0181: a half-typed number used to be saved on blur), and anything but a
 * whole number ≥ 0 is refused with a message. */
export function GuestCountInlineEdit({ initialValue }: { initialValue: number | null }) {
  const [guests, setGuests] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialValue !== null ? String(initialValue) : "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function cancel() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    if (busy) return;
    const trimmed = draft.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      setError(ESTIMATE_INVALID_ERROR);
      return;
    }
    setError(null);
    if (value === guests) {
      setEditing(false);
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/couple/guest-count", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_count_estimate: value }),
      });
      if (!response.ok) {
        const { error: message } = await response.json();
        throw new Error(message ?? "Не успеа зачувувањето на бројот на гости.");
      }
      setGuests(value);
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setEditing(false);
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на бројот на гости.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <>
        <input
          ref={inputRef}
          type="number"
          min={0}
          step={1}
          value={draft}
          aria-label="Проценка на бројот на гости"
          className="guests-input"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
            if (e.key === "Escape") cancel();
          }}
        />
        <button type="button" className="guests-edit" aria-label="Зачувај проценка" disabled={busy} onClick={() => void save()}>
          ✓
        </button>
        <button type="button" className="guests-edit" aria-label="Откажи" disabled={busy} onClick={cancel}>
          ✕
        </button>
        {error ? (
          <span role="alert" className="event-hero__error">
            {error}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className="guests-edit"
        aria-label="Промени проценка на гости"
        onClick={() => {
          setDraft(guests !== null ? String(guests) : "");
          setError(null);
          setEditing(true);
        }}
      >
        {guests !== null ? `Проценка: ${guests}` : "Додајте проценка на гости"} <Icon name="edit" size="sm" className="guests-edit__pencil" />
      </button>
      {saved ? <span className="saved-tick is-visible">Зачувано</span> : null}
      {error ? <span className="event-hero__error">{error}</span> : null}
    </>
  );
}
