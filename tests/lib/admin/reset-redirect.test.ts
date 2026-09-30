// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";

const h = vi.hoisted(() => ({ headers: vi.fn() }));
vi.mock("next/headers", () => h);

import { passwordResetRedirectTo } from "@/lib/admin/reset-redirect";

const fromMap = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  h.headers.mockReset();
});

describe("staff password-reset redirect (lib/origin.ts)", () => {
  it("prefers NEXT_PUBLIC_SITE_URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://kadesum.mk/";
    h.headers.mockResolvedValue(fromMap({ host: "admin.kadesum.mk" }));
    expect(await passwordResetRedirectTo()).toBe("https://kadesum.mk/reset-password");
  });

  it("falls back to the Host header, never x-forwarded-host", async () => {
    h.headers.mockResolvedValue(fromMap({ host: "app.example.mk", "x-forwarded-host": "evil.example" }));
    expect(await passwordResetRedirectTo()).toBe("https://app.example.mk/reset-password");
  });

  it("never links to the admin host: admin.<domain> becomes <domain>", async () => {
    h.headers.mockResolvedValue(fromMap({ host: "admin.kadesum.mk" }));
    expect(await passwordResetRedirectTo()).toBe("https://kadesum.mk/reset-password");
    h.headers.mockResolvedValue(fromMap({ host: "admin.localhost:3205" }));
    expect(await passwordResetRedirectTo()).toBe("http://localhost:3205/reset-password");
  });

  it("outside a request uses the configured site, or leaves it to Supabase", async () => {
    h.headers.mockRejectedValue(new Error("headers was called outside a request scope"));
    expect(await passwordResetRedirectTo()).toBeUndefined();
    process.env.NEXT_PUBLIC_SITE_URL = "https://kadesum.mk";
    expect(await passwordResetRedirectTo()).toBe("https://kadesum.mk/reset-password");
  });
});
