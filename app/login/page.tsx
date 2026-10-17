"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { authErrorMessage, GENERIC_ERROR } from "@/lib/auth-messages";
import { finishPendingSignup } from "@/lib/venue/pending-signup";

const EYEBROW = "Панел за управување";
const TAGLINE = "Управувајте со вашиот локал и настаните — сè на едно место.";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [venueJustOpened, setVenueJustOpened] = useState(false);

  // A new owner coming back from the "confirm your email" link lands here
  // already signed in but with no venue yet: open it and continue to the panel.
  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabaseClient();
    supabase.auth
      .getUser()
      .then(async ({ data }) => {
        if ((await finishPendingSignup(supabase, data.user)) && !cancelled) setVenueJustOpened(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (venueJustOpened) router.push("/venue?tour=1");
  }, [venueJustOpened, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(authErrorMessage(signInError));
        return;
      }
      const venueOpened = await finishPendingSignup(supabase, signInData?.user);
      router.push(venueOpened ? "/venue?tour=1" : "/venue");
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
