"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { MfaCodeForm, pendingSecondFactor } from "@/components/auth/MfaCodeForm";

// Spec §3.2/§3.3: admin sign-in checks the platform_admin role client-side
// (the real gate is checkAdmin/requireAdmin, which re-checks the role from
// the Auth server and requires aal2 — this is just so a non-admin, or an
// admin who hasn't finished their code, gets a clear message instead of a
// silent redirect loop) and routes an admin without a verified TOTP factor
// straight to mandatory enrolment, since two-factor is required for every
// admin session.
//
// `mfaRequired={false}` (ADMIN_MFA_REQUIRED=false, lib/admin/mfa-policy.ts)
// skips both steps: the password alone opens the panel, even for an admin
// who has a factor enrolled.
export function AdminLogin({ mfaRequired = true }: { mfaRequired?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const supabase = createBrowserSupabaseClient();
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Неточна е-пошта или лозинка.");
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (data.user?.app_metadata?.role !== "platform_admin") {
        await supabase.auth.signOut({ scope: "local" });
        setError("Оваа сметка нема админ пристап.");
        return;
      }
      if (!mfaRequired) {
        router.push("/admin");
        return;
      }
      const pending = await pendingSecondFactor(supabase);
      if (pending) {
        setFactorId(pending);
        return;
      }
      // No verified factor yet: TOTP enrolment is mandatory for admins.
      router.push("/admin/login/mfa");
    } catch {
      setError("Акцијата не успеа.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (factorId) {
    return (
      <MfaCodeForm
        factorId={factorId}
        onVerified={() => router.push("/admin")}
        onBack={() => setFactorId(null)}
      />
    );
  }

  return (
    <AuthScreen eyebrow="Админ" tagline="Управување со платформата." title="Најава">
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="lab-s" htmlFor="admin-email">
            Е-пошта
          </label>
          <input
            id="admin-email"
            className="fld"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="auth-field">
          <label className="lab-s" htmlFor="admin-password">
            Лозинка
          </label>
          <input
            id="admin-password"
            className="fld"
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
    </AuthScreen>
  );
}
