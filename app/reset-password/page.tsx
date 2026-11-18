"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { authErrorMessage, GENERIC_ERROR } from "@/lib/auth-messages";
import { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_HINT } from "@/lib/security/password";

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
    // A venue the admin just opened ("Нов локал") whose owner followed the
    // emailed link instead of signing in with the generated password: save
    // through the first-login route, so the "set your own password" flag is
    // cleared as well and the panel doesn't ask a second time.
    const { data: before } = await supabase.auth.getUser();
    if (before.user?.app_metadata?.must_change_password === true) {
      const response = await fetch("/api/venue/first-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? GENERIC_ERROR);
        return;
      }
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/venue";
      return;
    }
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
            minLength={MIN_PASSWORD_LENGTH}
            aria-describedby="reset-password-hint"
            required
          />
          <p id="reset-password-hint" className="ev-hint" style={{ margin: "4px 0 0" }}>
            {PASSWORD_LENGTH_HINT}
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
