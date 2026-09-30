import "server-only";
import { headers } from "next/headers";
import { resolveOrigin } from "@/lib/origin";
import { isAdminHost } from "@/lib/admin/host";

/**
 * Where a staff password-reset email sends the user: this site's
 * /reset-password (NEXT_PUBLIC_SITE_URL wins, else the request's Host — never
 * x-forwarded-host, lib/origin.ts). The admin host serves only the admin
 * dashboard, so an `admin.` Host is swapped for the main site's. Outside a request (scripts, tests) there
 * are no headers: the configured site is used, or undefined so Supabase
 * falls back to its own Site URL.
 */
export async function passwordResetRedirectTo(): Promise<string | undefined> {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  let h: Awaited<ReturnType<typeof headers>>;
  try {
    h = await headers();
  } catch {
    return site ? `${site.replace(/\/+$/, "")}/reset-password` : undefined;
  }
  const header = (name: string) => {
    const value = h.get(name);
    return name === "host" && isAdminHost(value) ? value!.trim().replace(/^admin\./i, "") : value;
  };
  return `${resolveOrigin(header, site)}/reset-password`;
}
