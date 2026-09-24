// app/couple/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthScreen } from "@/components/auth/AuthScreen";

export default function CoupleLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/couple/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok) {
        const { error: message } = await response.json();
        setError(message ?? "Something went wrong. Please try again.");
        return;
      }
      router.push("/couple");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthScreen
      eyebrow="Your event"
      tagline="Plan your agenda, guests, menu, budget, and seating — all in one place."
      title="Sign in to your event"
    >
      <form onSubmit={handleSubmit}>
        <div className="auth-field">
          <label className="lab-s" htmlFor="couple-login-username">
            Username
          </label>
          <input
            id="couple-login-username"
            className="fld"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="auth-field">
          <label className="lab-s" htmlFor="couple-login-password">
            Password
          </label>
          <input
            id="couple-login-password"
            className="fld"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
        <button type="submit" disabled={isSubmitting} className="btn btn-gold" style={{ width: "100%", justifyContent: "center" }}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthScreen>
  );
}
