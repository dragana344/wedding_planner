import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { REQUEST_ID_HEADER } from "@/lib/log";

export type AdminContext = { adminUserId: string; requestId: string | null };

export class AdminAccessError extends Error {
  constructor() {
    super("Admin access required.");
  }
}

/**
 * Spec §3.3: aal2 in the verified JWT, and the platform_admin role confirmed
 * by the Auth server (not the cookie). Fails closed on any error. Takes a
 * client rather than resolving one itself so it can be exercised directly
 * from a DB test, without a Next.js request (headers()/redirect stay in
 * requireAdmin below).
 */
export async function checkAdmin(supabase: SupabaseClient): Promise<AdminContext | null> {
  try {
    const { data: claims } = await supabase.auth.getClaims();
    if (claims?.claims?.aal !== "aal2") return null;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    if (data.user.app_metadata?.role !== "platform_admin") return null;
    return { adminUserId: data.user.id, requestId: null };
  } catch {
    return null;
  }
}

/**
 * checkAdmin bound to the current request's cookies, memoised with React
 * cache() so the layout, the page and every read query in one render share a
 * single Auth round trip. cache() is per request on the server; outside a
 * React render (Server Actions) it simply runs each time.
 */
const checkAdminForRequest = cache(async (): Promise<AdminContext | null> => checkAdmin(await createServerSupabaseClient()));

/**
 * The gate every admin page, read query and Server Action goes through. From a page
 * (`{ page: true }`) a failed check redirects to the admin login instead of
 * throwing, matching how the venue and couple panels gate their pages.
 */
export async function requireAdmin(options: { page?: boolean } = {}): Promise<AdminContext> {
  const ctx = await checkAdminForRequest();
  if (!ctx) {
    if (options.page) redirect("/admin/login");
    throw new AdminAccessError();
  }
  return { ...ctx, requestId: (await headers()).get(REQUEST_ID_HEADER) };
}
