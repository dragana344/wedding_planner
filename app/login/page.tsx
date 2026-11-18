"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { authErrorMessage, GENERIC_ERROR } from "@/lib/auth-messages";

const EYEBROW = "Панел за управување";
const TAGLINE = "Управувајте со вашиот локал и настаните — сè на едно место.";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(authErrorMessage(signInError));
        return;
      }
      // A hard navigation, not router.push: the venue layout's server-side
      // check reads the session from cookies, and a client-side transition
      // right after an auth-state change can race ahead of the auth SDK's
      // cookie write, landing back on /login instead of /venue.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/venue";
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (showForgotPassword) {
    return <ForgotPasswordForm eyebrow={EYEBROW} tagline={TAGLINE} onBack={() => setShowForgotPassword(false)} />;
  }

  return (
    <AuthScreen eyebrow={EYEBROW} tagline={TAGLINE} title="Најава">
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="lab-s" htmlFor="login-email">
            Е-пошта
          </label>
          <input
            id="login-email"
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
          <label className="lab-s" htmlFor="login-password">
            Лозинка
          </label>
          <input
            id="login-password"
            className="fld"
            placeholder="Лозинка"
            type="password"
            autoComplete="current-password"
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
      <button type="button" onClick={() => setShowForgotPassword(true)} className="auth-link">
        Заборавена лозинка?
      </button>
    </AuthScreen>
  );
}
