"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

// Admin sign-in checks the platform_admin role client-side so a non-admin
// gets a clear message instead of a silent redirect loop. The real gate is
// checkAdmin/requireAdmin, which re-checks the role with the Auth server.
export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

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
      router.push("/admin");
    } catch {
      setError("Акцијата не успеа.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (showForgotPassword) {
    return <ForgotPasswordForm eyebrow="Админ" tagline="Управување со платформата." onBack={() => setShowForgotPassword(false)} />;
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
      <button type="button" onClick={() => setShowForgotPassword(true)} className="auth-link">
        Заборавена лозинка?
      </button>
    </AuthScreen>
  );
}
