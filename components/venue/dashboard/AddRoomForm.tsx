"use client";

import { useState } from "react";
import { createRoom } from "@/lib/venue/rooms";

export function AddRoomForm({ venueId, onSaved }: { venueId: string; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await createRoom(venueId, name);
      onSaved();
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на просторијата. Обидете се повторно.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ev-form">
      <div className="ev-field">
        <label className="lab-s" htmlFor="new-room-name">
          Име на просторијата <span className="req">*</span>
        </label>
        <input
          id="new-room-name"
          className="fld"
          placeholder="пр. Голема сала"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
      <button type="submit" className="btn btn-gold" disabled={isSubmitting}>
        {isSubmitting ? "Се зачувува..." : "Зачувај просторија"}
      </button>
    </form>
  );
}
