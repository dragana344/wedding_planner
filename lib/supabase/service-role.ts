import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createServiceRoleClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: {
        // Supabase's client calls fetch() internally, and Next.js patches
        // the global fetch during server rendering to cache GET requests by
        // default — independent of a page's own `export const dynamic =
        // "force-dynamic"`, which only reliably forces a fresh render on
        // routes that also call headers()/cookies(). Public pages with no
        // auth (e.g. /invite/[slug]) have neither, so without this override
        // they can silently keep serving a stale snapshot of the database
        // fetched on an earlier request, even after the row has changed.
        fetch: (url, options) => fetch(url, { ...options, cache: "no-store" }),
      },
    }
  );
}
