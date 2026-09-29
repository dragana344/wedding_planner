import { createClient } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function resolveSupabaseClient() {
  // Test-only escape hatch: DB tests call browser-side venue code from Node.
  // `process.env.NODE_ENV` is inlined as "production" by `next build`, so this
  // whole branch (and the env var name inside it) is dropped from the browser
  // bundle (SEC-014).
  if (process.env.NODE_ENV === "test" && typeof window === "undefined" && process.env.VITEST) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey) return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);
  }
  return createBrowserSupabaseClient();
}
