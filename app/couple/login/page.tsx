// app/couple/login/page.tsx
"use client";

import { useState } from "react";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { GENERIC_ERROR } from "@/lib/auth-messages";

export default function CoupleLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/couple/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const { error: message } = await response.json();
        setError(message ?? GENERIC_ERROR);
        return;
      }
      // A hard navigation, not router.push: same reasoning as the venue and
      // admin logins — a client-side transition right after the session
      // cookie is set can race ahead of it in a way a real navigation can't.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/couple";
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScreen
      eyebrow="Вашиот настан"
      tagline="Планирајте ги вашата агенда, гости, мени, буџет и распоред — сè на едно место."
      title="Најавете се на вашиот настан"
    >
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="lab-s" htmlFor="couple-login-username">
            Корисничко име
          </label>
          <input
            id="couple-login-username"
            className="fld"
            placeholder="Корисничко име"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="auth-field">
          <label className="lab-s" htmlFor="couple-login-password">
            Лозинка
          </label>
          <input
            id="couple-login-password"
            className="fld"
            placeholder="Лозинка"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
          {isSubmitting ? "Се најавува..." : "Најави се"}
        </button>
      </form>
    </AuthScreen>
  );
}
