// tests/supabase/mfa_staff.test.ts
//
// SEC-016: opt-in TOTP MFA for venue staff. Once a staff user has a verified
// factor, a password-only (aal1) session must not reach venue data — neither
// through RLS with the anon key (migration 0044) nor through /venue pages and
// /api/venue routes (proxy.ts). Users without a factor and the service role
// are unaffected.

import { createHmac } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { proxy } from "@/proxy";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const RUN = `sec016-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = "mfa-staff-password-123";

// --- RFC 6238 TOTP (SHA-1, 30 s, 6 digits), as an authenticator app computes it.
function base32Decode(input: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of input.replace(/=+$/, "").toUpperCase()) {
    const v = alphabet.indexOf(ch);
    if (v < 0) throw new Error(`bad base32 char ${ch}`);
    bits += v.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

interface Staff {
  email: string;
  userId: string;
  venueId: string;
  eventId: string;
}

const staffUsers: string[] = [];
const venues: string[] = [];

async function createStaff(tag: string): Promise<Staff> {
  const email = `${RUN}-${tag}@test.local`;
  const { data: venue, error: vErr } = await admin.from("venues").insert({ name: `${RUN} ${tag}` }).select("id").single();
  if (vErr) throw vErr;
  venues.push(venue.id);
  const { data: user, error: uErr } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (uErr) throw uErr;
  staffUsers.push(user.user!.id);
  const { error: sErr } = await admin.from("venue_staff").insert({ user_id: user.user!.id, venue_id: venue.id });
  if (sErr) throw sErr;
  const { data: event, error: eErr } = await admin
    .from("events")
    .insert({ venue_id: venue.id, couple_names: `${RUN} ${tag}`, event_date: "2027-07-01" })
    .select("id")
    .single();
  if (eErr) throw eErr;
  return { email, userId: user.user!.id, venueId: venue.id, eventId: event.id };
}

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  return client;
}

async function passSecondFactor(client: SupabaseClient, factorId: string, secret: string) {
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
  if (error) throw error;
}

type Jar = Map<string, string>;

/** A browser cookie jar signed in the way @supabase/ssr writes it; optionally past the second factor. */
async function cookieSession(email: string, mfa?: { factorId: string; secret: string }): Promise<string> {
  const jar: Jar = new Map();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => Array.from(jar).map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  if (mfa) await passSecondFactor(supabase, mfa.factorId, mfa.secret);
  return Array.from(jar).map(([n, v]) => `${n}=${v}`).join("; ");
}

function request(path: string, cookie: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, { headers: { host: "localhost:3000", cookie } });
}

let mfaStaff: Staff;
let plainStaff: Staff;
let factorId: string;
let secret: string;

describe("TOTP MFA for venue staff (SEC-016)", () => {
  beforeAll(async () => {
    mfaStaff = await createStaff("mfa");
    plainStaff = await createStaff("plain");

    const client = await signIn(mfaStaff.email);
    const { data, error } = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Тест апликација" });
    if (error) throw error;
    expect(data.totp.qr_code).toMatch(/^data:image\/svg\+xml/);
    factorId = data.id;
    secret = data.totp.secret;
    await passSecondFactor(client, factorId, secret);
  });

  afterAll(async () => {
    for (const id of staffUsers) await admin.auth.admin.deleteUser(id);
    if (venues.length) await admin.from("venues").delete().in("id", venues);
  });

  it("an aal1 session of an MFA user reads no venue data through RLS", async () => {
    const client = await signIn(mfaStaff.email);
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal).toMatchObject({ currentLevel: "aal1", nextLevel: "aal2" });

    const events = await client.from("events").select("id").eq("venue_id", mfaStaff.venueId);
    expect(events.error).toBeNull();
    expect(events.data).toEqual([]);

    const venue = await client.from("venues").select("id").eq("id", mfaStaff.venueId);
    expect(venue.data).toEqual([]);

    const staffRow = await client.from("venue_staff").select("venue_id").eq("user_id", mfaStaff.userId);
    expect(staffRow.data).toEqual([]);

    const update = await client.from("events").update({ couple_names: "hijacked" }).eq("id", mfaStaff.eventId).select("id");
    expect(update.data ?? []).toEqual([]);

    const gate = await client.rpc("is_venue_staff_for", { target_venue_id: mfaStaff.venueId });
    expect(gate.data).toBe(false);
  });

  it("an aal2 session (after challenge + verify) reads its venue's events", async () => {
    const client = await signIn(mfaStaff.email);
    await passSecondFactor(client, factorId, secret);
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal?.currentLevel).toBe("aal2");

    const events = await client.from("events").select("id").eq("venue_id", mfaStaff.venueId);
    expect(events.data).toEqual([{ id: mfaStaff.eventId }]);
    const staffRow = await client.from("venue_staff").select("venue_id").eq("user_id", mfaStaff.userId);
    expect(staffRow.data).toEqual([{ venue_id: mfaStaff.venueId }]);
  });

  it("a staff user without a factor is unaffected at aal1", async () => {
    const client = await signIn(plainStaff.email);
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal).toMatchObject({ currentLevel: "aal1", nextLevel: "aal1" });
    const events = await client.from("events").select("id").eq("venue_id", plainStaff.venueId);
    expect(events.data).toEqual([{ id: plainStaff.eventId }]);
  });

  it("an aal1 session cannot remove the factor", async () => {
    const client = await signIn(mfaStaff.email);
    const { error } = await client.auth.mfa.unenroll({ factorId });
    expect(error).not.toBeNull();
    const { data } = await admin.auth.admin.mfa.listFactors({ userId: mfaStaff.userId });
    expect(data?.factors.map((f) => f.id)).toContain(factorId);
  });

  it("the service role still sees the MFA user's venue data", async () => {
    const { data } = await admin.from("events").select("id").eq("venue_id", mfaStaff.venueId);
    expect(data).toEqual([{ id: mfaStaff.eventId }]);
    const { data: staffRow } = await admin.from("venue_staff").select("venue_id").eq("user_id", mfaStaff.userId);
    expect(staffRow).toEqual([{ venue_id: mfaStaff.venueId }]);
  });

  describe("proxy", () => {
    it("does not add an Auth round trip: aal1 requests pass the proxy and RLS hides the data", async () => {
      // The data-level refusal is asserted in "an aal1 session of an MFA user
      // reads no venue data through RLS" above.
      const res = await proxy(request("/venue/calendar", await cookieSession(mfaStaff.email)));
      expect(res.status).toBe(200);
    });

    it("lets an aal2 session through", async () => {
      const cookie = await cookieSession(mfaStaff.email, { factorId, secret });
      expect((await proxy(request("/venue/calendar", cookie))).status).toBe(200);
      expect((await proxy(request("/api/venue/privacy/export", cookie))).status).toBe(200);
    });

    it("lets an aal1 session of a user without a factor through", async () => {
      const res = await proxy(request("/venue", await cookieSession(plainStaff.email)));
      expect(res.status).toBe(200);
    });
  });
});
