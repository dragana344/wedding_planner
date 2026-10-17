"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";

/** Click → number input, Enter/blur saves, Esc cancels. Replaces the old
 * input + "Зачувај" button on the couple dashboard's event hero card. */
export function GuestCountInlineEdit({ initialValue }: { initialValue: number | null }) {
  const [guests, setGuests] = useState(initialValue);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialValue !== null ? String(initialValue) : "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    committedRef.current = false;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  async function commit(save: boolean) {
    if (committedRef.current) return;
    committedRef.current = true;
    setEditing(false);
    if (!save) return;

    const trimmed = draft.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isInteger(value) || value < 0)) return;
    if (value === guests) return;

    setError(null);
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
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на бројот на гости.");
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        step={1}
        value={draft}
        aria-label="Број на гости"
        className="guests-input"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(true);
          if (e.key === "Escape") commit(false);
        }}
        onBlur={() => commit(true)}
      />
    );
  }

  return (
    <>
      <button
        type="button"
        className="guests-edit"
        aria-label="Промени број на гости"
        onClick={() => {
          setDraft(guests !== null ? String(guests) : "");
          setEditing(true);
        }}
      >
        {guests !== null ? `${guests} гости` : "Додајте број на гости"} <Icon name="edit" size="sm" className="guests-edit__pencil" />
      </button>
      {saved ? <span className="saved-tick is-visible">Зачувано</span> : null}
      {error ? <span className="event-hero__error">{error}</span> : null}
    </>
  );
}
