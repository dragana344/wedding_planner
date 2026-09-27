"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

async function provisionVenue(venueName: string): Promise<Response> {
  return fetch("/api/venue/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ venue_name: venueName }),
  });
}

export function SignupForm() {
  const router = useRouter();
  const [venueName, setVenueName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      if (!signUpData.session) {
        setError("Please check your email to confirm your account before signing in.");
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
        setError(message ?? "Something went wrong. Please try again.");
        return;
      }

      router.push("/venue?tour=1");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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
          placeholder="Име на локалот"
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
          placeholder="Е-пошта"
          type="email"
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
        {isSubmitting ? "Се регистрира..." : "Регистрирај се"}
      </button>
    </form>
  );
}
