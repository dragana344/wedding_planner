"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { authErrorMessage, GENERIC_ERROR } from "@/lib/auth-messages";

/** Shared by venue and admin login (both AuthScreen-based) — same reset
 * flow, just different eyebrow/tagline copy for each audience. */
export function ForgotPasswordForm({
  eyebrow,
  tagline,
  onBack,
}: {
  eyebrow: string;
  tagline: string;
  onBack: () => void;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    setIsSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (resetError) {
        setError(authErrorMessage(resetError));
        return;
      }
      setStatus("Доколку постои сметка со таа е-пошта, испративме линк за ресетирање.");
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScreen eyebrow={eyebrow} tagline={tagline} title="Ресетирај лозинка">
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="lab-s" htmlFor="reset-email">
            Е-пошта
          </label>
          <input
            id="reset-email"
            className="fld"
            placeholder="Е-пошта"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        {status ? <p className="auth-status">{status}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
          {isSubmitting ? "Се испраќа..." : "Испрати линк за ресетирање"}
        </button>
      </form>
      <button type="button" onClick={onBack} className="auth-link">
        Назад кон најава
      </button>
    </AuthScreen>
  );
}
