"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/**
 * Finishes a link from an account email wherever it lands.
 *
 * Supabase sends the reader back with `?code=…` (or an error) to the address
 * we asked for, and to the site's root when that address is not on its allow
 * list. On any page: a password-reset link goes on to the new-password form,
 * and a link that cannot be used (expired, used, or opened in a browser that
 * did not ask for it) gets a page that says so instead of a silent landing.
 */
export function AuthLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const failed = query.has("error_code") || hash.has("error_code") || query.has("error_description") || hash.has("error_description");
    const hasLink = query.has("code") || hash.has("access_token");

    if (failed) {
      router.replace("/auth/link-expired");
      return;
    }
    if (!hasLink) return;

    // Creating the client is what exchanges the code for a session.
    const supabase = createBrowserSupabaseClient();
    let recovery = false;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "PASSWORD_RECOVERY") return;
      recovery = true;
      router.replace("/reset-password");
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session && !recovery) router.replace("/auth/link-expired");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  return null;
}
