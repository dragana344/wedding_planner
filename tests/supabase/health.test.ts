import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health (REL-001)", () => {
  it("returns 200 with ok and release when the database answers", async () => {
    const res = await GET(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ ok: true, release: expect.any(String) });
  });

  it("returns 503 when the database is unreachable", async () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:59999";
    try {
      const res = await GET(new Request("http://localhost/api/health"));
      expect(res.status).toBe(503);
      expect((await res.json()).ok).toBe(false);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original;
    }
  });
});
