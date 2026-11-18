"use client";

import { useState } from "react";
import Link from "next/link";

const SEND_ERROR = "Барањето не се испрати. Обидете се повторно.";

/** /signup: venues are set up by the team, so the public page asks for a demo instead of opening an account. */
export function DemoRequestForm() {
  const [name, setName] = useState("");
  const [venueName, setVenueName] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
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
      const response = await fetch("/api/venue/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, venue_name: venueName, city, phone, email, message }),
      });
      if (!response.ok) {
        const { error: msg } = await response.json();
        setError(msg ?? SEND_ERROR);
        return;
      }
      setSent(true);
    } catch {
      setError(SEND_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-done" role="status">
        <p>
          <b>Ви благодариме! Ќе ве контактираме наскоро.</b>
        </p>
        <Link href="/" className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
          Назад на почетна
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="auth-field">
        <label className="lab-s" htmlFor="demo-name">
          Име и презиме
        </label>
        <input id="demo-name" className="fld" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="demo-venue-name">
          Име на локалот
        </label>
        <input
          id="demo-venue-name"
          className="fld"
          placeholder="пр. Ресторан Езеро"
          autoComplete="organization"
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          required
        />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="demo-city">
          Град
        </label>
        <input id="demo-city" className="fld" autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} required />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="demo-phone">
          Телефон
        </label>
        <input id="demo-phone" className="fld" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="demo-email">
          Е-пошта
        </label>
        <input
          id="demo-email"
          className="fld"
          placeholder="ime@primer.mk"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="demo-message">
          Порака <span style={{ fontWeight: 400, color: "var(--muted)" }}>(незадолжително)</span>
        </label>
        <textarea id="demo-message" className="fld" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
        {isSubmitting ? "Се испраќа..." : "Побарај демо"}
      </button>
      <p className="ev-hint" style={{ margin: "10px 0 0", textAlign: "center" }}>
        Податоците ги користиме само за да ве контактираме.{" "}
        <Link href="/privacy" target="_blank">
          Политика за приватност
        </Link>
      </p>
    </form>
  );
}
