"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/** A way out of the first-login screens (same sign-out as AccountMenu). */
export function SignOutLink() {
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function signOut() {
    setIsSigningOut(true);
    await createBrowserSupabaseClient().auth.signOut({ scope: "local" });
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  return (
    <button type="button" className="auth-link" onClick={() => void signOut()} disabled={isSigningOut}>
      Одјави се
    </button>
  );
}
