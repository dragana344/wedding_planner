"use client";

import { useState } from "react";
import { createMenuTemplate } from "@/lib/venue/menus";
import { errorMessage } from "@/lib/venue/user-error";

export function MenuTemplateForm({ venueId, onSaved }: { venueId: string; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await createMenuTemplate(venueId, name, description);
      onSaved();
      setName("");
      setDescription("");
    } catch (err) {
      setError(errorMessage(err, "Не успеа зачувувањето на менито. Обидете се повторно."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ev-form">
      <div className="ev-field">
        <label className="lab-s" htmlFor="new-template-name">
          Име на менито <span className="req">*</span>
        </label>
        <input
          id="new-template-name"
          className="fld"
          placeholder="пр. Свадбено мени - класично"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>
      <div className="ev-field">
        <label className="lab-s" htmlFor="new-template-description">
          Опис (опционално)
        </label>
        <input
          id="new-template-description"
          className="fld"
          placeholder="Краток опис за организаторите"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
      <button type="submit" className="btn btn-gold" disabled={isSubmitting}>
        {isSubmitting ? "Се зачувува..." : "Создади мени"}
      </button>
    </form>
  );
}
