import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * One client per request: memoized with React `cache()` so a layout and the
 * page it wraps share it (and so share memoized lookups keyed on it, like
 * getCurrentVenue). Outside a server render `cache()` is a pass-through.
 */
export const createServerSupabaseClient = cache(async () => {
  const cookieStore = await cookies();
  return createServerClient(
    supabaseUrl(),
    supabaseAnonKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll was called from a Server Component during a page render,
            // where Next.js does not allow writing cookies. Safe to ignore here
            // since the login route handler and browser client both set the
            // session cookie themselves when the user actually signs in.
          }
        },
      },
    }
  );
});
