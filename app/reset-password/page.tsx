"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { MfaCodeForm, pendingSecondFactor } from "@/components/auth/MfaCodeForm";
import { authErrorMessage, GENERIC_ERROR } from "@/lib/auth-messages";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // SEC-025 SR-07: staff with MFA must pass their code before Supabase lets
  // the recovery session change the password.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const factorId = await pendingSecondFactor(createBrowserSupabaseClient());
      if (factorId) {
        setMfaFactorId(factorId);
        return;
      }
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
    router.push("/venue");
  }

  if (mfaFactorId) {
    return (
      <MfaCodeForm
        factorId={mfaFactorId}
        onVerified={async () => {
          await savePassword();
          setMfaFactorId(null);
        }}
        onBack={() => setMfaFactorId(null)}
        backLabel="Назад"
        signOutOnBack={false}
      />
    );
  }

  return (
    <AuthScreen
      eyebrow="Панел за управување"
      tagline="Управувајте со вашиот локал, настани и резервации — сè на едно место."
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
