"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { MfaCodeForm, pendingSecondFactor } from "@/components/auth/MfaCodeForm";
import { authErrorMessage, GENERIC_ERROR } from "@/lib/auth-messages";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  // SEC-016: set when the password is right but the account has a TOTP factor.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);

  // An aal1 session of an MFA user lands here (the panel finds no staff row
  // until the code is given): go straight to the code step if the browser
  // still holds that session.
  useEffect(() => {
    let cancelled = false;
    pendingSecondFactor(createBrowserSupabaseClient())
      .then((factorId) => {
        if (!cancelled && factorId) setMfaFactorId(factorId);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

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
      const factorId = await pendingSecondFactor(supabase);
      if (factorId) {
        setMfaFactorId(factorId);
        return;
      }
      router.push("/venue");
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (showForgotPassword) {
    return <ForgotPasswordForm onBack={() => setShowForgotPassword(false)} />;
  }

  if (mfaFactorId) {
    return (
      <MfaCodeForm
        factorId={mfaFactorId}
        onVerified={() => router.push("/venue")}
        onBack={() => {
          setMfaFactorId(null);
          setPassword("");
        }}
      />
    );
  }

  return (
    <AuthScreen
      eyebrow="Панел за управување"
      tagline="Управувајте со вашиот локал, настани и резервации — сè на едно место."
      title="Најава"
    >
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="lab-s" htmlFor="login-email">
            Е-пошта
          </label>
          <input
            id="login-email"
            className="fld"
            placeholder="Е-пошта"
            type="email"
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

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
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
      setStatus("If an account exists for that email, a reset link has been sent.");
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScreen
      eyebrow="Панел за управување"
      tagline="Управувајте со вашиот локал, настани и резервации — сè на едно место."
      title="Ресетирај лозинка"
    >
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
