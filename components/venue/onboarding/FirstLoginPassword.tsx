"use client";

import { useState } from "react";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { GENERIC_ERROR } from "@/lib/auth-messages";
import { SignOutLink } from "./SignOutLink";
import { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_ERROR, PASSWORD_LENGTH_HINT } from "@/lib/security/password";


/**
 * Shown by app/venue/layout.tsx instead of the panel while the account still
 * has the password the admin generated ("Нов локал"). Posts to
 * /api/venue/first-login, which sets it and clears the flag.
 */
export function FirstLoginPassword() {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(PASSWORD_LENGTH_ERROR);
      return;
    }
    if (password !== repeat) {
      setError("Лозинките не се совпаѓаат.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/venue/first-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? GENERIC_ERROR);
        return;
      }
      // A hard navigation: the layout re-checks the account on the server.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/venue";
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScreen
      theme="landing"
      eyebrow="Панел за управување"
      tagline="Управувајте со вашиот локал и настаните — сè на едно место."
      title="Поставете нова лозинка"
      subtitle="Ова е првото најавување. Изберете своја лозинка за најава наместо добиената."
    >
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="lab-s" htmlFor="first-login-password">
            Нова лозинка
          </label>
          <input
            id="first-login-password"
            className="fld"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            aria-describedby="first-login-password-hint"
            required
          />
          <p id="first-login-password-hint" className="ev-hint" style={{ margin: "4px 0 0" }}>
            {PASSWORD_LENGTH_HINT}
          </p>
        </div>
        <div className="auth-field">
          <label className="lab-s" htmlFor="first-login-repeat">
            Повторете ја лозинката
          </label>
          <input
            id="first-login-repeat"
            className="fld"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            required
          />
        </div>
        {error ? (
          <p className="auth-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
          {isSubmitting ? "Се зачувува..." : "Зачувај лозинка"}
        </button>
      </form>
      <SignOutLink />
    </AuthScreen>
  );
}
