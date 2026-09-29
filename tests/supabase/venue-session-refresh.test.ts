import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { proxy as middleware } from "@/proxy";

// AUTH-001: an expired venue access token is refreshed by middleware (and the
// new cookies are written onto the response), so the session survives the
// JWT expiry without a manual re-login.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const email = "auth001-refresh@test.local";
const password = "test-password-123";
let userId: string;

type Jar = Map<string, string>;

async function signedInJar(): Promise<Jar> {
  const jar: Jar = new Map();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => Array.from(jar).map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return jar;
}

/** Rewrites the stored session so it looks expired, exactly as a browser would hold it an hour later. */
function expire(jar: Jar): { name: string; value: string; accessToken: string } {
  const names = Array.from(jar.keys()).sort();
  const base = names[0].replace(/\.\d+$/, "");
  const raw = names.map((n) => jar.get(n)).join("");
  const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64url").toString("utf8"));
  session.expires_at = Math.floor(Date.now() / 1000) - 60;
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  return { name: base, value, accessToken: session.access_token };
}

describe("venue session refresh in middleware (AUTH-001)", () => {
  beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(userId);
  });

  it("refreshes an expired session and sets new auth cookies instead of redirecting", async () => {
    const { name, value, accessToken } = expire(await signedInJar());
    const request = new NextRequest("http://localhost:3000/venue/calendar", {
      headers: { host: "localhost:3000", cookie: `${name}=${value}` },
    });

    const res = await middleware(request);

    expect(res.status).toBe(200);
    const written = res.cookies.getAll().filter((c) => c.name.startsWith(name) && c.value);
    expect(written.length).toBeGreaterThan(0);
    const refreshed = JSON.parse(
      Buffer.from(written.map((c) => c.value).join("").replace(/^base64-/, ""), "base64url").toString("utf8"),
    );
    expect(refreshed.access_token).not.toBe(accessToken);
    expect(refreshed.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("lets a valid session through without a redirect", async () => {
    const jar = await signedInJar();
    const cookie = Array.from(jar).map(([n, v]) => `${n}=${v}`).join("; ");
    const res = await middleware(
      new NextRequest("http://localhost:3000/venue", { headers: { host: "localhost:3000", cookie } }),
    );
    expect(res.status).toBe(200);
  });
});
