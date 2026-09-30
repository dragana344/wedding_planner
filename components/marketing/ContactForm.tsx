"use client";

import { useState } from "react";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/venue/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      if (!response.ok) {
        const { error: msg } = await response.json();
        setError(msg ?? "Failed to send message.");
        return;
      }
      setSent(true);
    } catch {
      setError("Failed to send message.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sent) {
    return <p className="contact-sent">Благодариме! Ќе Ве контактираме наскоро.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="contact-form">
      <label htmlFor="contact-name">
        Име
        <input id="contact-name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
      </label>
      <label htmlFor="contact-email">
        Е-пошта
        <input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
      </label>
      <label htmlFor="contact-message">
        Порака
        <textarea id="contact-message" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required />
      </label>
      {error ? <p className="contact-error">{error}</p> : null}
      <button type="submit" disabled={isSubmitting} className="btn btn-red">
        {isSubmitting ? "Се испраќа..." : "Испрати порака"}
      </button>
    </form>
  );
}
