import { createHmac } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createCoupleSession } from "@/lib/couple/session-token";
import { validateAndRenewCoupleSession } from "@/lib/couple/session-verify";
import { POST as login } from "@/app/api/couple/login/route";
import { POST as rsvp } from "@/app/api/invite/[slug]/rsvp/route";
import { getVenueAccess } from "@/lib/venue/venue-access";
import { getCurrentVenue } from "@/lib/venue/current-venue";

// The venue privacy routes authenticate through the cookie-bound server
// client; here it is a supabase-js client signed in as the test's staff user
// (same pattern as tests/supabase/privacy.test.ts).
const session = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => session.client }));

import { GET as exportRoute } from "@/app/api/venue/privacy/export/route";
import { POST as eraseRoute } from "@/app/api/venue/privacy/erase-event/route";
import { POST as deleteRoute } from "@/app/api/venue/privacy/delete-account/route";

// RFC 6238 TOTP (SHA-1, 30 s, 6 digits), as an authenticator app computes it.
// Duplicated rather than imported (see tests/supabase/mfa_staff.test.ts and
// tests/supabase/admin_guard.test.ts, which each carry their own copy — this
// codebase's established pattern for this small, self-contained helper).
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

// Admin spec D8: a blocked venue's staff lose access (RLS + BlockedScreen) and
// its couples lose access (session refused, login answers the blocked
// message), but guests can still open the invitation and RSVP.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
let venueId: string;
let eventId: string;
let staffId: string;
const slug = `blk${stamp}`.slice(0, 20);

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: "Blocked Venue" }).select("id").single()).data!.id;
  eventId = (await admin.from("events").insert({ venue_id: venueId, couple_names: "Blk & Test", event_date: "2028-06-01" }).select("id").single()).data!.id;
  const { error: credError } = await admin.rpc("create_event_credentials", {
    p_event_id: eventId,
    p_username: `blk-${stamp}`,
    p_password: "long-enough-77",
  });
  if (credError) throw credError;
  await admin.from("event_invitations").insert({ event_id: eventId, template_id: "romantic-floral", public_slug: slug });
  staffId = (await admin.auth.admin.createUser({ email: `blk-${stamp}@test.local`, password: "staff-password-9", email_confirm: true })).data.user!.id;
  await admin.from("venue_staff").insert({ user_id: staffId, venue_id: venueId });
  // Block AFTER the event/credentials/invitation exist, so the fixtures
  // themselves are created against an un-blocked venue.
  await admin.from("venues").update({ blocked_at: new Date().toISOString(), blocked_reason: "неплатено" }).eq("id", venueId);
});

afterAll(async () => {
  await admin.auth.admin.deleteUser(staffId);
  await admin.from("venues").delete().eq("id", venueId);
});

describe("blocked venue (spec D8)", () => {
  it("staff see no venue data", async () => {
    const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: `blk-${stamp}@test.local`, password: "staff-password-9" });
    expect((await c.from("events").select("id").eq("venue_id", venueId)).data).toEqual([]);
  });

  it("getVenueAccess reports blocked staff as blocked, with the reason, not as no-staff", async () => {
    const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: `blk-${stamp}@test.local`, password: "staff-password-9" });
    expect(await getVenueAccess(c)).toEqual({ status: "blocked", reason: "неплатено" });
  });

  it("couple sessions are refused and login answers the blocked message", async () => {
    const { token } = await createCoupleSession(eventId);
    expect(await validateAndRenewCoupleSession(token)).toBeNull();
    const res = await login(
      new NextRequest("http://localhost/api/couple/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": `blk-${stamp}` },
        body: JSON.stringify({ username: `blk-${stamp}`, password: "long-enough-77" }),
      }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Пристапот е привремено оневозможен.");
  });

  it("guests can still RSVP", async () => {
    const res = await rsvp(
      new NextRequest(`http://localhost/api/invite/${slug}/rsvp`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": `blk-g-${stamp}` },
        body: JSON.stringify({ full_name: "Гостин", attending: true }),
      }),
      { params: { slug } },
    );
    expect(res.status).toBe(200);
  });

  it("getCurrentVenue resolves blocked staff to no venue (no „Локал“ placeholder)", async () => {
    const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: `blk-${stamp}@test.local`, password: "staff-password-9" });
    expect(await getCurrentVenue(c)).toBeNull();
  });

  // Controller ruling: a blocked venue loses the self-service privacy
  // actions too (export, erase, delete); the platform admin handles such
  // requests. The routes answer exactly as they do for non-staff.
  it("refuses blocked staff on the venue privacy routes and changes nothing", async () => {
    const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: `blk-${stamp}@test.local`, password: "staff-password-9" });
    session.client = c;
    const post = (path: string, body: unknown) =>
      new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    expect((await exportRoute(new NextRequest("http://localhost/api/venue/privacy/export"))).status).toBe(401);
    expect((await eraseRoute(post("/api/venue/privacy/erase-event", { event_id: eventId, confirm: "Blk & Test" }), { params: {} })).status).toBe(401);
    expect((await deleteRoute(post("/api/venue/privacy/delete-account", { confirm: "Blocked Venue" }), { params: {} })).status).toBe(401);

    expect((await admin.from("events").select("couple_names").eq("id", eventId).single()).data!.couple_names).toBe("Blk & Test");
    expect((await admin.from("venues").select("id").eq("id", venueId)).data).toHaveLength(1);
  });

  it("staff cannot unblock or change the plan themselves", async () => {
    const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: `blk-${stamp}@test.local`, password: "staff-password-9" });
    await c.from("venues").update({ blocked_at: null }).eq("id", venueId);
    const { data } = await admin.from("venues").select("blocked_at").eq("id", venueId).single();
    expect(data!.blocked_at).not.toBeNull();
  });
});

// SEC-016 regression guard: getVenueAccess must keep resolving an aal1
// session of an MFA-enrolled staff user to "none" (so proxy.ts and the venue
// layout still send them to /login's code step), never to "ok" (the venue
// name would leak before the second factor) or "blocked" — this venue is not
// blocked at all.
describe("getVenueAccess and MFA (SEC-016 regression guard)", () => {
  const mfaStamp = `${Date.now()}-mfa`;
  const mfaEmail = `mfa-${mfaStamp}@test.local`;
  const mfaPassword = "mfa-staff-password-123";
  let mfaVenueId: string;
  let mfaStaffId: string;
  let factorId: string;
  let secret: string;

  beforeAll(async () => {
    mfaVenueId = (await admin.from("venues").insert({ name: "MFA Venue" }).select("id").single()).data!.id;
    mfaStaffId = (await admin.auth.admin.createUser({ email: mfaEmail, password: mfaPassword, email_confirm: true })).data.user!.id;
    await admin.from("venue_staff").insert({ user_id: mfaStaffId, venue_id: mfaVenueId });

    const enrollClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await enrollClient.auth.signInWithPassword({ email: mfaEmail, password: mfaPassword });
    const { data, error } = await enrollClient.auth.mfa.enroll({ factorType: "totp", friendlyName: "Тест апликација" });
    if (error) throw error;
    factorId = data.id;
    secret = data.totp.secret;
    const challenge = await enrollClient.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
    if (challenge.error) throw challenge.error;
  });

  afterAll(async () => {
    await admin.auth.admin.deleteUser(mfaStaffId);
    await admin.from("venues").delete().eq("id", mfaVenueId);
  });

  it("an aal1 session of an MFA-enrolled staff user resolves to status 'none', not 'ok' or 'blocked'", async () => {
    const c = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: mfaEmail, password: mfaPassword });
    const { data: aal } = await c.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal).toMatchObject({ currentLevel: "aal1", nextLevel: "aal2" });

    expect(await getVenueAccess(c)).toEqual({ status: "none" });
  });
});
