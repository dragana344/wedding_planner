"use client";

import { useState } from "react";
import type { SupportTicket } from "@/lib/venue/support";

const GENERIC_ERROR = "Барањето не се испрати. Обидете се повторно.";

/** Shared by the venue and couple dashboards: posts to whichever endpoint
 * resolves the caller's venue/event server-side (never a client-supplied
 * id), then hands the new ticket to the caller to prepend to its list. */
export function SupportTicketForm({ endpoint, onSubmitted }: { endpoint: string; onSubmitted: (ticket: SupportTicket) => void }) {
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, problem, description }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      onSubmitted(data.ticket as SupportTicket);
      setName("");
      setProblem("");
      setDescription("");
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ev-form">
      <div className="ev-field">
        <label className="lab-s" htmlFor="support-name">
          Име <span className="req">*</span>
        </label>
        <input id="support-name" className="fld" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required disabled={isSubmitting} />
      </div>
      <div className="ev-field">
        <label className="lab-s" htmlFor="support-problem">
          Проблем <span className="req">*</span>
        </label>
        <input
          id="support-problem"
          className="fld"
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          placeholder="пр. Не можам да зачувам распоред на маси"
          maxLength={200}
          required
          disabled={isSubmitting}
        />
      </div>
      <div className="ev-field ev-field-wide">
        <label className="lab-s" htmlFor="support-description">
          Опис <span className="req">*</span>
        </label>
        <textarea
          id="support-description"
          className="fld"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Опишете го проблемот со повеќе детали..."
          maxLength={5000}
          required
          disabled={isSubmitting}
        />
      </div>
      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
      <button type="submit" className="btn btn-gold" disabled={isSubmitting}>
        {isSubmitting ? "Се испраќа..." : "Испрати барање"}
      </button>
    </form>
  );
}
