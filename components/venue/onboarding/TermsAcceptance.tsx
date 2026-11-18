"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { GENERIC_ERROR } from "@/lib/auth-messages";
import { SignOutLink } from "./SignOutLink";

/**
 * The venue accepts the current Terms (incl. the DPA). Shown by
 * app/venue/layout.tsx instead of the panel until the venue has accepted
 * them for the first time, and inside the panel at /venue/terms (`embedded`)
 * after a new version — that one never blocks the staff. Only the owner
 * accepts on the venue's behalf, so it asks for the owner's manager
 * password; anyone else signed in on the venue's shared login sees who has
 * to do it. A venue with no owner login (`ownerName` empty) accepts with the
 * venue's own sign-in password.
 */
export function TermsAcceptance({ venueName, ownerName, embedded = false }: { venueName: string; ownerName: string; embedded?: boolean }) {
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasOwner = ownerName !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/venue/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, accepted: true }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; startTour?: boolean };
      if (!response.ok) {
        setError(data.error ?? GENERIC_ERROR);
        return;
      }
      // A brand-new venue opens with the onboarding tour; the in-panel page
      // goes back to the dashboard; otherwise reload the page the visitor
      // was on.
      window.location.href = data.startTour ? "/venue?tour=1" : embedded ? "/venue" : window.location.pathname + window.location.search;
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  const form = (
    <form onSubmit={handleSubmit}>
      <ul style={{ margin: "0 0 14px", paddingLeft: 18, lineHeight: 1.7 }}>
        <li>
          <Link href="/terms" target="_blank" rel="noopener noreferrer">
            Услови за користење
          </Link>
        </li>
        <li>
          <Link href="/privacy" target="_blank" rel="noopener noreferrer">
            Политика за приватност
          </Link>
        </li>
        <li>
          <Link href="/dpa" target="_blank" rel="noopener noreferrer">
            Договор за обработка на податоци
          </Link>
        </li>
      </ul>
      <p className="ev-hint" style={{ margin: "0 0 12px" }}>
        {!hasOwner
          ? "Локалот нема најава за сопственик: прифатете ги условите со лозинката за најава на локалот."
          : embedded
            ? `Ако не сте сопственикот (${ownerName}), повикајте го да ги прифати. Панелот работи и до тогаш.`
            : `Ако не сте сопственикот (${ownerName}), повикајте го: панелот ќе се отвори откако тој ќе ги прифати условите.`}
      </p>
      <div className="auth-field">
        <label className="lab-s" htmlFor="terms-owner-password">
          {hasOwner ? "Лозинка на сопственикот" : "Лозинка за најава на локалот"}
        </label>
        <input
          id="terms-owner-password"
          className="fld"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "0 0 14px" }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required />
        <span>Ги прочитав и ги прифаќам Условите за користење и Договорот за обработка на податоци во име на локалот.</span>
      </label>
      {error ? (
        <p className="auth-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={isSubmitting || !agreed} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
        {isSubmitting ? "Се зачувува..." : "Прифаќам"}
      </button>
    </form>
  );

  if (embedded) {
    return (
      <div className="wrap">
        <section className="panel" style={{ maxWidth: 560, padding: 24 }}>
          <h1 className="panel-t" style={{ margin: "0 0 6px" }}>
            Ажурирани услови за користење
          </h1>
          <p className="muted" style={{ margin: "0 0 14px" }}>
            Условите се променија од последниот пат кога ги прифативте. Сопственикот треба да ги прифати во име на {venueName}.
          </p>
          {form}
        </section>
      </div>
    );
  }

  return (
    <AuthScreen
      theme="landing"
      eyebrow={venueName}
      tagline="Управувајте со вашиот локал и настаните — сè на едно место."
      title="Услови за користење"
      subtitle="Пред да продолжите, сопственикот на локалот треба да ги прифати условите."
    >
      {form}
      <SignOutLink />
    </AuthScreen>
  );
}
