"use client";

import { useState } from "react";

// Guards a destructive action (venue deletion) behind an exact-text
// confirmation, same pattern as GitHub's "type the repo name to delete it".
export function ConfirmTyped({
  expected,
  label,
  onConfirm,
  danger = true,
  pending = false,
}: {
  expected: string;
  label: string;
  onConfirm: (typed: string) => void;
  danger?: boolean;
  /** Disables the field and the button while a previous confirm is still in
   * flight, so a second click can't fire the action again before the first
   * one resolves (e.g. a double-submitted venue deletion). */
  pending?: boolean;
}) {
  const [typed, setTyped] = useState("");
  const id = `confirm-${label.replace(/\s+/g, "-")}`;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
      <div>
        <label className="lab-s" htmlFor={id}>{`Напишете „${expected}“ за потврда`}</label>
        <input id={id} className="fld" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={pending} />
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        style={danger ? { color: "var(--bad)" } : undefined}
        disabled={typed !== expected || pending}
        onClick={() => onConfirm(typed)}
      >
        {label}
      </button>
    </div>
  );
}
