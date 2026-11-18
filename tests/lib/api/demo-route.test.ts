// @vitest-environment node
//
// POST /api/venue/demo: /signup's "request a demo" form (public signup is
// closed). Validated, rate-limited like the contact form, then stored.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const demo = vi.hoisted(() => ({ submitDemoRequest: vi.fn(async () => undefined) }));
vi.mock("@/lib/venue/contact", () => demo);

const rateLimit = vi.hoisted(() => ({
  RATE_LIMITS: { demoRequest: { bucket: "demo-request", limit: 5, windowSeconds: 3600, failClosed: true } },
  checkRateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: vi.fn(() => "1.2.3.4"),
  rateLimitedResponse: vi.fn(() => NextResponse.json({ error: "Премногу обиди." }, { status: 429 })),
}));
vi.mock("@/lib/security/rate-limit", () => rateLimit);

import { POST } from "@/app/api/venue/demo/route";

const VALID = { name: "Марија", venue_name: "Ресторан Езеро", city: "Охрид", phone: "070 123 456", email: "m@example.com" };

function post(body: unknown) {
  return new NextRequest("http://localhost/api/venue/demo", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(body: unknown) {
  const res = await POST(post(body), { params: Promise.resolve({}) } as never);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/venue/demo", () => {
  it("stores a valid request and answers ok", async () => {
    expect(await call({ ...VALID, message: "Две сали." })).toEqual({ status: 200, body: { ok: true } });
    expect(rateLimit.checkRateLimit).toHaveBeenCalledWith(rateLimit.RATE_LIMITS.demoRequest, "1.2.3.4");
    expect(demo.submitDemoRequest).toHaveBeenCalledWith({
      name: "Марија",
      venueName: "Ресторан Езеро",
      city: "Охрид",
      phone: "070 123 456",
      email: "m@example.com",
      message: "Две сали.",
    });
  });

  it("refuses a missing required field before storing anything", async () => {
    for (const field of ["name", "venue_name", "city", "phone", "email"] as const) {
      const res = await call({ ...VALID, [field]: " " });
      expect(res, field).toEqual({ status: 400, body: { error: "Внесете име, локал, град, телефон и е-пошта." } });
    }
    expect((await call("{not json")).status).toBe(400);
    expect(demo.submitDemoRequest).not.toHaveBeenCalled();
  });

  it("answers 429 once the per-IP limit is spent, without storing", async () => {
    rateLimit.checkRateLimit.mockResolvedValueOnce({ ok: false } as never);
    expect((await call(VALID)).status).toBe(429);
    expect(demo.submitDemoRequest).not.toHaveBeenCalled();
  });

  it("answers with a plain error when storing fails", async () => {
    // A PostgREST error (has a code), not a user-facing plain Error.
    demo.submitDemoRequest.mockRejectedValueOnce({ code: "23514", message: "violates check constraint" } as never);
    const res = await call(VALID);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Барањето не се испрати. Обидете се повторно.");
  });
});
