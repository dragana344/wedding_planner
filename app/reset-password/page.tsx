"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { authErrorMessage, GENERIC_ERROR } from "@/lib/auth-messages";

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await savePassword();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function savePassword() {
    setError(null);
    const supabase = createBrowserSupabaseClient();
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError(authErrorMessage(updateError));
      return;
    }
    // SEC-017: a password change ends the sessions on other devices; this
    // browser keeps its own.
    await supabase.auth.signOut({ scope: "others" });
    // This page is shared by both the venue and admin "forgot password"
    // flows (ForgotPasswordForm redirects here either way) — an admin must
    // land on /admin, not /venue. A hard navigation, not router.push: same
    // reasoning as the other logins — a client-side transition right after
    // an auth-state change can race ahead of the auth SDK's cookie write.
    const { data } = await supabase.auth.getUser();
    window.location.href = data.user?.app_metadata?.role === "platform_admin" ? "/admin" : "/venue";
  }

  return (
    <AuthScreen
      theme="landing"
      eyebrow="Панел за управување"
      tagline="Управувајте со вашиот локал и настаните — сè на едно место."
      title="Нова лозинка"
    >
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="lab-s" htmlFor="reset-new-password">
            Нова лозинка
          </label>
          <input
            id="reset-new-password"
            className="fld"
            placeholder="Нова лозинка"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={10}
            aria-describedby="reset-password-hint"
            required
          />
          <p id="reset-password-hint" className="ev-hint" style={{ margin: "4px 0 0" }}>
            Најмалку 10 знаци.
          </p>
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
          {isSubmitting ? "Се зачувува..." : "Зачувај лозинка"}
        </button>
      </form>
    </AuthScreen>
  );
}
