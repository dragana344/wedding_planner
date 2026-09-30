// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

// proxy.ts's maintenanceResponse now ORs the env flag with the DB-stored
// flag (task 4.1) — this unit suite has no database, so the module is
// mocked here rather than exercising the real one (that's
// tests/supabase/platform_settings.test.ts's job). isMaintenanceModeStale
// returns false so proxy() never starts a background refresh in this file.
vi.mock("@/lib/platform-settings", () => ({
  peekMaintenanceMode: () => false,
  isMaintenanceModeStale: () => false,
  refreshMaintenanceMode: async () => false,
  invalidateMaintenanceCache: () => {},
}));

// @supabase/ssr is mocked so a test can play the part of an Auth server
// that rotates the session during getClaims(): the mock calls the cookie
// adapter's setAll() with `rotated` (when set), exactly like the real client
// does after refreshing an expired access token.
const ssr = vi.hoisted(() => ({
  rotated: null as { name: string; value: string; options: Record<string, unknown> }[] | null,
  seenCookies: [] as { name: string; value: string }[],
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, opts: { cookies: { getAll(): { name: string; value: string }[]; setAll(c: unknown[]): void } }) => ({
    auth: {
      getClaims: async () => {
        ssr.seenCookies = opts.cookies.getAll();
        if (ssr.rotated) opts.cookies.setAll(ssr.rotated);
        return { data: ssr.rotated ? { claims: { sub: "admin-user" } } : null, error: null };
      },
    },
  }),
}));

import { proxy } from "@/proxy";

function req(path: string, host: string, cookie?: string) {
  return new NextRequest(new URL(path, `http://${host}`), { headers: cookie ? { host, cookie } : { host } });
}

// NextResponse.rewrite/next's `{ request: { headers } }` option reflects
// every header of that object onto the response as `x-middleware-request-
// <name>` (node_modules/next/dist/server/web/spec-extension/response.js's
// handleMiddlewareField) — that's how a unit test can observe what proxy.ts
// forwards downstream without a real second request.
function forwardedHost(res: Response): string | null {
  return res.headers.get("x-middleware-request-x-forwarded-host");
}

describe("admin subdomain routing", () => {
  it("rewrites every admin-host path under /admin", async () => {
    const root = await proxy(req("/", "admin.localhost:3000"));
    expect(root.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:3000/admin");
    expect(forwardedHost(root)).toBe("admin.localhost:3000");
    const venues = await proxy(req("/venues?q=x", "admin.localhost:3000"));
    expect(venues.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:3000/admin/venues?q=x");
  });

  it("does not double-prefix a path that already starts with /admin", async () => {
    // Passes through (NextResponse.next()) rather than rewriting again once
    // the pathname already has its final "/admin..." form — proxy.ts's own
    // comment explains why a second rewrite here would be wrong on a real
    // server. Still forwards x-forwarded-host on this pass-through path too.
    const res = await proxy(req("/admin/venues", "admin.localhost:3000"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(forwardedHost(res)).toBe("admin.localhost:3000");
  });

  it("answers 404 for /admin on the main host", async () => {
    const res = await proxy(req("/admin", "localhost:3000"));
    expect(res.status).toBe(404);
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect((await proxy(req("/admin/venues", "localhost:3000"))).status).toBe(404);
  });

  it("leaves main-host routing unchanged", async () => {
    const res = await proxy(req("/", "localhost:3000"));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("ignores maintenance mode on the admin host", async () => {
    process.env.MAINTENANCE_MODE = "1";
    try {
      expect((await proxy(req("/", "admin.localhost:3000"))).status).toBe(200);
      expect((await proxy(req("/", "localhost:3000"))).status).toBe(503);
    } finally {
      delete process.env.MAINTENANCE_MODE;
    }
  });

  describe("admin session refresh", () => {
    const ROTATED = [
      { name: "sb-test-auth-token", value: "rotated-session", options: { path: "/", httpOnly: true, sameSite: "lax", maxAge: 400 } },
    ];
    afterEach(() => {
      ssr.rotated = null;
    });

    it("propagates refreshed session cookies on an admin rewrite", async () => {
      ssr.rotated = ROTATED;
      const res = await proxy(req("/venues", "admin.localhost:3000", "sb-test-auth-token=old-session"));
      expect(ssr.seenCookies).toEqual([{ name: "sb-test-auth-token", value: "old-session" }]);
      expect(res.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:3000/admin/venues");
      expect(res.headers.get("set-cookie")).toContain("sb-test-auth-token=rotated-session");
      // Downstream (requireAdmin's server client) sees the new session in
      // this same request, and the branch's own forwarded headers survive.
      expect(res.headers.get("x-middleware-request-cookie")).toContain("sb-test-auth-token=rotated-session");
      expect(forwardedHost(res)).toBe("admin.localhost:3000");
      expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.headers.get("x-middleware-request-x-request-id")).toBe(res.headers.get("x-request-id"));
    });

    it("propagates refreshed session cookies on an admin pass-through", async () => {
      ssr.rotated = ROTATED;
      const res = await proxy(req("/admin/venues", "admin.localhost:3000", "sb-test-auth-token=old-session"));
      expect(res.headers.get("x-middleware-rewrite")).toBeNull();
      expect(res.headers.get("set-cookie")).toContain("sb-test-auth-token=rotated-session");
      expect(forwardedHost(res)).toBe("admin.localhost:3000");
    });

    it("never redirects a signed-out admin request (requireAdmin gates)", async () => {
      const res = await proxy(req("/venues", "admin.localhost:3000"));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      expect(res.headers.get("set-cookie")).toBeNull();
    });
  });
});
