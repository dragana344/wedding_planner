// tests/supabase/admin_guard.test.ts
//
// requireAdmin() / checkAdmin() (admin dashboard spec §3.3): a platform admin
// must be signed in with a verified TOTP factor at aal2, and the
// platform_admin role must be confirmed by the Auth server on every call —
// not trusted from a cached cookie. checkAdmin is the testable core: it
// takes a client so it can be exercised here without a Next.js request
// (headers()/redirect live only in requireAdmin, lib/admin/guard.ts).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkAdmin } from "@/lib/admin/guard";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const password = "admin-password-123";
let adminId: string;
let plainId: string;
let factorId: string;
let secret: string;

// RFC 6238 TOTP (same helper as tests/supabase/mfa_staff.test.ts).
function totp(base32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

beforeAll(async () => {
  adminId = (await admin.auth.admin.createUser({ email: `guard-admin-${stamp}@test.local`, password, email_confirm: true, app_metadata: { role: "platform_admin" } })).data.user!.id;
  plainId = (await admin.auth.admin.createUser({ email: `guard-plain-${stamp}@test.local`, password, email_confirm: true })).data.user!.id;
  const c = await signIn(`guard-admin-${stamp}@test.local`);
  const enrolled = await c.auth.mfa.enroll({ factorType: "totp" });
  factorId = enrolled.data!.id;
  secret = enrolled.data!.totp.secret;
  await c.auth.mfa.challengeAndVerify({ factorId, code: totp(secret) });
});

afterAll(async () => {
  await admin.auth.admin.deleteUser(adminId);
  await admin.auth.admin.deleteUser(plainId);
});

describe("checkAdmin (spec §3.3)", () => {
  it("accepts a platform admin at aal2", async () => {
    const c = await signIn(`guard-admin-${stamp}@test.local`);
    await c.auth.mfa.challengeAndVerify({ factorId, code: totp(secret, Date.now() + 30_000) });
    expect(await checkAdmin(c)).toMatchObject({ adminUserId: adminId });
  });

  it("refuses the admin at aal1 (password only)", async () => {
    expect(await checkAdmin(await signIn(`guard-admin-${stamp}@test.local`))).toBeNull();
  });

  it("refuses a user without the role", async () => {
    expect(await checkAdmin(await signIn(`guard-plain-${stamp}@test.local`))).toBeNull();
  });

  it("refuses once the role is removed server-side, even with an aal2 token that still claims it", async () => {
    const c = await signIn(`guard-admin-${stamp}@test.local`);
    await c.auth.mfa.challengeAndVerify({ factorId, code: totp(secret, Date.now() + 60_000) });
    await admin.auth.admin.updateUserById(adminId, { app_metadata: { role: null } });
    try {
      expect(await checkAdmin(c)).toBeNull();
    } finally {
      await admin.auth.admin.updateUserById(adminId, { app_metadata: { role: "platform_admin" } });
    }
  });

  it("refuses when signed out", async () => {
    expect(await checkAdmin(createClient(url, anonKey, { auth: { persistSession: false } }))).toBeNull();
  });
});
