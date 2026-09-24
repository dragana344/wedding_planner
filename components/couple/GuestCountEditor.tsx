"use client";

import { useState } from "react";

export function GuestCountEditor({ initialValue }: { initialValue: number | null }) {
  const [value, setValue] = useState(initialValue !== null ? String(initialValue) : "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setIsSaving(true);
    try {
      const response = await fetch("/api/couple/guest-count", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_count_estimate: value === "" ? null : Number(value) }),
      });
      if (!response.ok) {
        const { error: message } = await response.json();
        throw new Error(message ?? "Failed to save guest count.");
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save guest count.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", alignItems: "flex-end", gap: 10, marginTop: 8 }}>
      <div style={{ width: 140 }}>
        <label htmlFor="guest-count" className="lab-s">
          Estimated guests
        </label>
        <input
          id="guest-count"
          type="number"
          min={0}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          className="fld"
        />
      </div>
      <button type="submit" disabled={isSaving} className="btn btn-gold">
        {isSaving ? "Saving..." : "Save"}
      </button>
      {saved ? <span style={{ color: "var(--ok)", fontSize: 13.5 }}>Saved</span> : null}
      {error ? <span style={{ color: "var(--bad)", fontSize: 13.5 }}>{error}</span> : null}
    </form>
  );
}
