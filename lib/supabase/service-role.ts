import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/env";

const SERVICE_ROLE_FETCH_TIMEOUT_MS = 10_000;

export function createServiceRoleClient(): SupabaseClient {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY. See docs/production/SECRETS.md.");
  return createClient(
    supabaseUrl(),
    serviceRoleKey,
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
        // REL-004: no single attempt may hang; a stalled Supabase fails
        // within the timeout instead of holding the request open.
        fetch: (url, options) =>
          fetch(url, {
            ...options,
            cache: "no-store",
            signal: options?.signal
              ? AbortSignal.any([options.signal, AbortSignal.timeout(SERVICE_ROLE_FETCH_TIMEOUT_MS)])
              : AbortSignal.timeout(SERVICE_ROLE_FETCH_TIMEOUT_MS),
          }),
      },
    }
  );
}
