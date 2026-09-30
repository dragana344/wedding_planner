import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as login } from "@/app/api/couple/login/route";

// SEC-022: six bad logins for a real username (which locks it) and for an
// unknown one produce identical responses.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const realUsername = `enum-real-${Date.now()}`;
let venueId: string;

beforeAll(async () => {
  const { data: venue } = await admin.from("venues").insert({ name: "Enumeration Venue" }).select("id").single();
  venueId = venue!.id;
  const { data: event } = await admin
    .from("events")
    .insert({ venue_id: venueId, couple_names: "Enum & Test", event_date: "2027-10-01" })
    .select("id")
    .single();
  await admin.rpc("create_event_credentials", { p_event_id: event!.id, p_username: realUsername, p_password: "the-right-password" });
});

afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
});

async function attempts(username: string) {
  const out: { status: number; body: unknown }[] = [];
  for (let i = 0; i < 6; i++) {
    const res = await login(
      new NextRequest("http://localhost/api/couple/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": `enum-${randomUUID()}` },
        body: JSON.stringify({ username, password: "wrong-password" }),
      }),
    );
    out.push({ status: res.status, body: await res.json() });
  }
  return out;
}

describe("couple login does not reveal usernames (SEC-022)", () => {
  it("answers a real (then locked) username exactly like an unknown one", async () => {
    const real = await attempts(realUsername);
    const unknown = await attempts(`enum-nobody-${Date.now()}`);
    expect(real).toEqual(unknown);
    expect(real.every((r) => r.status === 401)).toBe(true);

    const { data } = await admin.from("event_credentials").select("locked_until").eq("username", realUsername).single();
    expect(data!.locked_until).not.toBeNull(); // the lockout itself still applies
  });
});
