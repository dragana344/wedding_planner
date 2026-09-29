import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as login } from "@/app/api/couple/login/route";
import { POST as logout } from "@/app/api/couple/logout/route";
import { proxy as middleware } from "@/proxy";

// End to end over the real route handlers and middleware: a couple logs in,
// the cookie (raw token) is accepted by middleware even though only its hash
// is stored (SEC-008), and logout kills it.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const username = "session-flow-couple";
const password = "Session-flow-pass-1";
let venueId: string;
let eventId: string;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Session Flow Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: event } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: "Flow & Test", event_date: "2026-12-01" })
    .select("id")
    .single();
  eventId = event!.id;
  const { error } = await admin.rpc("create_event_credentials", { p_event_id: eventId, p_username: username, p_password: password });
  if (error) throw error;
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

function couplePageRequest(cookie: string) {
  return new NextRequest("http://localhost:3000/api/couple/guests", {
    headers: { host: "localhost:3000", cookie: `couple_session=${cookie}` },
  });
}

describe("couple login → middleware → logout", () => {
  it("accepts the login cookie in middleware and rejects it after logout", async () => {
    const res = await login(
      new NextRequest("http://localhost:3000/api/couple/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      }),
    );
    expect(res.status).toBe(200);
    const cookie = res.cookies.get("couple_session")!.value;
    expect(cookie).toMatch(/^[0-9a-f]{64}$/);

    const gated = await middleware(couplePageRequest(cookie));
    expect(gated.status).toBe(200);
    expect(gated.headers.get("x-middleware-request-x-couple-event-id")).toBe(eventId);

    const { data: stored } = await admin.from("couple_sessions").select("token").eq("event_id", eventId);
    expect(stored!.map((r) => r.token)).not.toContain(cookie);

    await logout(new NextRequest("http://localhost:3000/api/couple/logout", { method: "POST", headers: { cookie: `couple_session=${cookie}` } }));
    const after = await middleware(couplePageRequest(cookie));
    expect(after.status).toBe(401);
  });
});
