import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { POST as login } from "@/app/api/couple/login/route";
import { POST as contact } from "@/app/api/venue/contact/route";
import { POST as rsvp } from "@/app/api/invite/[slug]/rsvp/route";

// SEC-002 over the real routes and the Postgres store. Each test uses its own
// client IP so runs don't share windows.

function post(url: string, ip: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": ip },
    body: JSON.stringify(body),
  });
}

describe("rate limits on public and credential routes (SEC-002)", () => {
  it("couple login: 10 attempts per minute per IP, then 429", async () => {
    const ip = `login-${randomUUID()}`;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await login(post("http://localhost/api/couple/login", ip, { username: `nobody-${i}`, password: "wrong-password" }));
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);

    const other = await login(post("http://localhost/api/couple/login", `other-${randomUUID()}`, { username: "x", password: "y" }));
    expect(other.status).toBe(401);
  });

  it("contact form: 5 per hour per IP, then 429", async () => {
    const ip = `contact-${randomUUID()}`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await contact(post("http://localhost/api/venue/contact", ip, { name: "Rate Test", email: "rate@test.local", message: `hello ${i}` }), {
        params: {},
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("fails closed (503) for login and open for RSVP when the limiter store is unreachable", { timeout: 30_000 }, async () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:59999";
    try {
      const loginRes = await login(post("http://localhost/api/couple/login", "down", { username: "x", password: "y" }));
      expect(loginRes.status).toBe(503);
      const rsvpRes = await rsvp(post("http://localhost/api/invite/abcdefghijkl/rsvp", "down", { full_name: "A", status: "confirmed" }), {
        params: { slug: "abcdefghijkl" },
      });
      expect(rsvpRes.status).not.toBe(503);
      expect(rsvpRes.status).not.toBe(429);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original;
    }
  });
});

describe("no raw database errors in responses (SEC-003)", () => {
  it("answers an infrastructure failure with the route's own message, not the driver's", { timeout: 30_000 }, async () => {
    const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:59999";
    try {
      const res = await rsvp(post("http://localhost/api/invite/abcdefghijkl/rsvp", `db-${randomUUID()}`, { full_name: "A", status: "confirmed" }), {
        params: { slug: "abcdefghijkl" },
      });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Одговорот не е испратен. Обидете се повторно." });
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = original;
    }
  });
});
