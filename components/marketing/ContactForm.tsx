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
      <div className="auth-field">
        <label className="lab-s" htmlFor="contact-name">Име</label>
        <input id="contact-name" className="fld" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="contact-email">Е-пошта</label>
        <input id="contact-email" className="fld" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="contact-message">Порака</label>
        <textarea id="contact-message" className="fld" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} required />
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="submit" disabled={isSubmitting} className="btn btn-gold">
        {isSubmitting ? "Се испраќа..." : "Испрати"}
      </button>
    </form>
  );
}
