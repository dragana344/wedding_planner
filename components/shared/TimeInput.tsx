"use client";

import { useState, type InputHTMLAttributes } from "react";

// A 24-hour time field. The native <input type="time"> renders in the
// browser's locale, so on an English-language browser it shows AM/PM, which
// people here misread. This one always shows and emits "HH:MM".

/** "9" → "09:00", "930" → "09:30", "18.30" → "18:30"; null if not a 24h time. */
export function parseTime24(text: string): string | null {
  const t = text.trim();
  const sep = /^(\d{1,2})\s*[:.,h]\s*(\d{1,2})$/.exec(t);
  let h: number;
  let m: number;
  if (sep) {
    h = Number(sep[1]);
    m = Number(sep[2]);
  } else if (/^\d{1,4}$/.test(t)) {
    h = Number(t.length <= 2 ? t : t.slice(0, t.length - 2));
    m = t.length <= 2 ? 0 : Number(t.slice(-2));
  } else {
    return null;
  }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Typed far enough that it can't be the start of a different time. */
function isComplete(text: string): boolean {
  return /^\d{1,2}[:.,h]\d{2}$/.test(text.trim()) || /^\d{4}$/.test(text.trim());
}

/** Accepts the "HH:MM:SS" the database sometimes returns. */
function display(value: string): string {
  return /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : value;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

export function TimeInput({ value, onChange, onBlur, ...rest }: Props) {
  const [draft, setDraft] = useState(display(value));
  const [synced, setSynced] = useState(value);
  // A preset button or a reset upstream changes the value: show it.
  if (value !== synced) {
    setSynced(value);
    setDraft(display(value));
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={rest.placeholder ?? "ЧЧ:ММ"}
      maxLength={5}
      value={draft}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        if (text.trim() === "") {
          setSynced("");
          onChange("");
          return;
        }
        const parsed = parseTime24(text);
        if (parsed && isComplete(text)) {
          setSynced(parsed);
          onChange(parsed);
        }
      }}
      onBlur={(e) => {
        const parsed = parseTime24(draft);
        if (parsed) {
          setDraft(parsed);
          if (parsed !== value) {
            setSynced(parsed);
            onChange(parsed);
          }
        } else if (draft.trim() !== "") {
          // Not a time: put back the last good value.
          setDraft(display(value));
        }
        onBlur?.(e);
      }}
    />
  );
}
