"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { authErrorMessage, GENERIC_ERROR } from "@/lib/auth-messages";

// SEC-016: the TOTP code step, shared by login and password reset.

/**
 * The verified TOTP factor still to be passed in this session, or null when
 * the session needs no second step (no factor, or already aal2).
 */
export async function pendingSecondFactor(supabase: ReturnType<typeof createBrowserSupabaseClient>): Promise<string | null> {
  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !aal || aal.nextLevel !== "aal2" || aal.currentLevel === "aal2") return null;
  const { data: factors } = await supabase.auth.mfa.listFactors();
  return factors?.totp.find((factor) => factor.status === "verified")?.id ?? null;
}

export function MfaCodeForm({
  factorId,
  onVerified,
  onBack,
  backLabel = "Назад кон најава",
  signOutOnBack = true,
}: {
  factorId: string;
  onVerified: () => void | Promise<void>;
  onBack: () => void;
  backLabel?: string;
  /** Login: drop the half-finished aal1 session so the password is asked again. */
  signOutOnBack?: boolean;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Внесете го 6-цифрениот код од апликацијата.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) {
        setError(/invalid/i.test(verifyError.message) ? "Кодот не е точен. Обидете се повторно." : authErrorMessage(verifyError));
        setCode("");
        return;
      }
      await onVerified();
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBack() {
    if (signOutOnBack) await createBrowserSupabaseClient().auth.signOut({ scope: "local" }).catch(() => undefined);
    onBack();
  }

  return (
    <AuthScreen
      eyebrow="Панел за управување"
      tagline="Управувајте со вашиот локал, настани и резервации — сè на едно место."
      title="Двофакторска потврда"
      subtitle="Внесете го 6-цифрениот код од вашата апликација за автентикација."
    >
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="lab-s" htmlFor="login-mfa-code">
            Код од апликацијата
          </label>
          <input
            id="login-mfa-code"
            className="fld"
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            autoFocus
            required
          />
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
          {isSubmitting ? "Се проверува..." : "Потврди"}
        </button>
      </form>
      <button type="button" onClick={handleBack} className="auth-link">
        {backLabel}
      </button>
    </AuthScreen>
  );
}
