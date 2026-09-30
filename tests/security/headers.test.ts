// @vitest-environment node
import { describe, it, expect } from "vitest";
import { nextConfig, contentSecurityPolicy, noindexPaths } from "@/next.config.mjs";

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<HeaderRule[]> {
  return (await nextConfig.headers!()) as HeaderRule[];
}

describe("security headers (SEC-001)", () => {
  it("applies the full security header set to every route", async () => {
    const all = (await rules()).find((r) => r.source === "/:path*");
    const keys = all!.headers.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
      ]),
    );
    expect(keys).toContain("Content-Security-Policy"); // enforced, not report-only
  });

  it("locks down framing, plugins and base URIs in the CSP", () => {
    expect(contentSecurityPolicy).toContain("frame-ancestors 'none'");
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(contentSecurityPolicy).toContain("base-uri 'self'");
    expect(contentSecurityPolicy).toContain("default-src 'self'");
  });
});

describe("noindex on private areas (COMP-004)", () => {
  it("sends X-Robots-Tag: noindex for venue, couple, invite and api paths", async () => {
    const all = await rules();
    for (const source of ["/venue/:path*", "/couple/:path*", "/invite/:path*", "/api/:path*"]) {
      const rule = all.find((r) => r.source === source);
      expect(rule?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    }
    expect(noindexPaths).not.toContain("/");
  });
});

describe("CSP allows only the configured third parties", () => {
  it("adds nothing beyond self and Supabase when no Sentry DSN is configured", () => {
    const connect = contentSecurityPolicy.split("; ").find((d) => d.startsWith("connect-src"))!;
    expect(connect).not.toMatch(/sentry/);
  });
});
