// @vitest-environment node
import { describe, it, expect } from "vitest";
import { checkRateLimit, clientIp, rateLimitedResponse, type RateLimitStore } from "@/lib/security/rate-limit";

function memoryStore() {
  const counts = new Map<string, number>();
  const store: RateLimitStore = async (key) => {
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    return next;
  };
  return Object.defineProperty(store, "keys", { get: () => Array.from(counts.keys()) }) as RateLimitStore & { readonly keys: string[] };
}

const downStore: RateLimitStore = async () => {
  throw new Error("connection refused");
};

const rule = { bucket: "test", limit: 3, windowSeconds: 60, failClosed: false };

describe("checkRateLimit (SEC-002)", () => {
  it("allows requests up to the limit and refuses the next with 429", async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) expect(await checkRateLimit(rule, "1.2.3.4", store)).toEqual({ ok: true });
    expect(await checkRateLimit(rule, "1.2.3.4", store)).toEqual({ ok: false, status: 429 });
  });

  it("counts subjects separately and never stores the raw subject", async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) await checkRateLimit(rule, "1.2.3.4", store);
    expect(await checkRateLimit(rule, "5.6.7.8", store)).toEqual({ ok: true });
    expect(store.keys.join(" ")).not.toContain("1.2.3.4");
    expect(store.keys[0]).toMatch(/^test:[0-9a-f]{64}$/);
  });

  it("fails open when the store is down for fail-open rules", async () => {
    expect(await checkRateLimit(rule, "1.2.3.4", downStore)).toEqual({ ok: true });
  });

  it("fails closed with 503 when the store is down for fail-closed rules", async () => {
    expect(await checkRateLimit({ ...rule, failClosed: true }, "1.2.3.4", downStore)).toEqual({ ok: false, status: 503 });
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for hop", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("http://x", { headers: { "x-forwarded-for": "1.1.1.1, 10.0.0.1" } }))).toBe("1.1.1.1");
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});

describe("rateLimitedResponse", () => {
  it("answers 429 with Retry-After and 503 without", async () => {
    const limited = rateLimitedResponse({ ok: false, status: 429 });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect((await limited.json()).error).toMatch(/Премногу обиди/);
    expect(rateLimitedResponse({ ok: false, status: 503 }).status).toBe(503);
  });
});
