// This site's origin for links printed in QR codes (review M3). A configured
// NEXT_PUBLIC_SITE_URL wins; otherwise the Host header — never
// x-forwarded-host, which any client can send when no proxy overwrites it.

const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;
const FALLBACK = "http://localhost:3000";

export function resolveOrigin(header: (name: string) => string | null, siteUrl?: string | null): string {
  if (siteUrl) return siteUrl.replace(/\/+$/, "");
  const host = header("host");
  if (!host || !HOST.test(host)) return FALLBACK;
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const forwarded = header("x-forwarded-proto");
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : local ? "http" : "https";
  return `${proto}://${host}`;
}
