import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { validateAndRenewCoupleSession } from "@/lib/couple/session-verify";
import { middleware } from "@/middleware";

// REL-004: with Supabase unreachable, the couple session check (awaited by
// middleware on every couple request) gives up within its bound.

async function withUnreachableSupabase<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://10.255.255.1:54321"; // non-routable: connections hang
  try {
    return await fn();
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = original;
  }
}

describe("bounded Supabase calls (REL-004)", () => {
  it("fails the couple session lookup within ~3s instead of hanging", { timeout: 15_000 }, async () => {
    const started = Date.now();
    const result = await withUnreachableSupabase(() => validateAndRenewCoupleSession("any-token"));
    expect(result).toBeNull();
    expect(Date.now() - started).toBeLessThan(4500);
  });

  it("answers a couple API request with 401 within the bound when the database stalls", { timeout: 15_000 }, async () => {
    const started = Date.now();
    const res = await withUnreachableSupabase(() =>
      middleware(new NextRequest("http://localhost:3000/api/couple/guests", { headers: { host: "localhost:3000", cookie: "couple_session=abc" } })),
    );
    expect(res.status).toBe(401);
    expect(Date.now() - started).toBeLessThan(4500);
  });
});
