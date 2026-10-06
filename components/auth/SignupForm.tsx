"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { authErrorMessage, GENERIC_ERROR } from "@/lib/auth-messages";
import { provisionVenue } from "@/lib/venue/pending-signup";

export function SignupForm() {
  const router = useRouter();
  const [venueName, setVenueName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Set when the account was created but the email still has to be confirmed.
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      // The venue name travels in the user's metadata so the venue can be
      // opened on the first sign-in when the email has to be confirmed first
      // (lib/venue/pending-signup.ts).
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { venue_name: venueName.trim() }, emailRedirectTo: `${window.location.origin}/login` },
      });
      if (signUpError) {
        setError(authErrorMessage(signUpError));
        return;
      }
      // With "Confirm email" on, Supabase answers a taken address with no
      // error: a stand-in user that has no identities, and no email is sent.
      // Without this check the form would promise an email that never comes.
      if (!signUpData.session && signUpData.user?.identities?.length === 0) {
        setError(authErrorMessage({ code: "user_already_exists" }));
        return;
      }
      if (!signUpData.session) {
        setConfirmEmail(email);
        return;
      }

      let response = await provisionVenue(venueName);
      if (!response.ok && response.status !== 401) {
        // A transient failure right after signUp shouldn't strand a
        // freshly-created account — retry once before giving up.
        // (A 401 is not transient — the session is missing/invalid both
        // times — so retrying it would just waste a round-trip.)
        response = await provisionVenue(venueName);
      }
      if (!response.ok) {
        const { error: message } = await response.json();
        setError(message ?? GENERIC_ERROR);
        return;
      }

      router.push("/venue?tour=1");
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (confirmEmail) {
    return (
      <div className="auth-done" role="status">
        <p>
          Ви испративме email на <b>{confirmEmail}</b>. Потврдете ја сметката преку линкот, па најавете се.
        </p>
        <p>Не го гледате? Проверете ја папката за спам.</p>
        <Link href="/login" className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
          Кон најава
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="auth-field">
        <label className="lab-s" htmlFor="signup-venue-name">
          Име на локалот
        </label>
        <input
          id="signup-venue-name"
          className="fld"
          placeholder="пр. Ресторан Езеро"
          autoComplete="organization"
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
          required
        />
      </div>
      <div className="auth-field">
        <label className="lab-s" htmlFor="signup-email">
          Е-пошта
        </label>
        <input
          id="signup-email"
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
        <label className="lab-s" htmlFor="signup-password">
          Лозинка
        </label>
        <input
          id="signup-password"
          className="fld"
          placeholder="Лозинка"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={10}
          aria-describedby="signup-password-hint"
          required
        />
        <p id="signup-password-hint" className="ev-hint" style={{ margin: "4px 0 0" }}>
          Најмалку 10 знаци.
        </p>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
        {isSubmitting ? "Се регистрира..." : "Регистрирај се"}
      </button>
      <p className="ev-hint" style={{ margin: "10px 0 0", textAlign: "center" }}>
        Со регистрацијата се согласувате со{" "}
        <Link href="/terms" target="_blank">
          Условите за користење
        </Link>{" "}
        и{" "}
        <Link href="/dpa" target="_blank">
          Договорот за обработка на лични податоци
        </Link>{" "}
        и потврдувате дека ја прочитавте{" "}
        <Link href="/privacy" target="_blank">
          Политиката за приватност
        </Link>
        .
      </p>
    </form>
  );
}
