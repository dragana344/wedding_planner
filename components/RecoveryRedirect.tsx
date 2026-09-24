"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/**
 * The password-reset email always lands on this app's root URL with a
 * `#access_token=...&type=recovery` hash fragment — Supabase's local auth
 * setup does not honor a custom path in `redirectTo` for this flow, so
 * every recovery link resolves to the bare root regardless of what page
 * we ask for. Supabase's client auto-detects that hash fragment and fires
 * a `PASSWORD_RECOVERY` auth event; this listens for it and forwards to
 * the actual reset-password page, per Supabase's documented pattern.
 */
export function RecoveryRedirect() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.push("/reset-password");
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
