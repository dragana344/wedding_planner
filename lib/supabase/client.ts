import { createBrowserClient } from "@supabase/ssr";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    supabaseUrl(),
    supabaseAnonKey()
  );
}
