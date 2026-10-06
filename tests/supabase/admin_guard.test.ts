// tests/supabase/admin_guard.test.ts
//
// requireAdmin() / checkAdmin(): the platform_admin role must be confirmed by
// the Auth server on every call — not trusted from a cached cookie.
// checkAdmin is the testable core: it takes a client so it can be exercised
// here without a Next.js request (headers()/redirect live only in
// requireAdmin, lib/admin/guard.ts).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkAdmin } from "@/lib/admin/guard";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const stamp = Date.now();
const password = "admin-password-123";
let adminId: string;
let plainId: string;

async function signIn(email: string): Promise<SupabaseClient> {
  const c = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

beforeAll(async () => {
  adminId = (await admin.auth.admin.createUser({ email: `guard-admin-${stamp}@test.local`, password, email_confirm: true, app_metadata: { role: "platform_admin" } })).data.user!.id;
  plainId = (await admin.auth.admin.createUser({ email: `guard-plain-${stamp}@test.local`, password, email_confirm: true })).data.user!.id;
});

afterAll(async () => {
  await admin.auth.admin.deleteUser(adminId);
  await admin.auth.admin.deleteUser(plainId);
});

describe("checkAdmin", () => {
  it("accepts a signed-in platform admin", async () => {
    expect(await checkAdmin(await signIn(`guard-admin-${stamp}@test.local`))).toMatchObject({ adminUserId: adminId });
  });

  it("refuses a user without the role", async () => {
    expect(await checkAdmin(await signIn(`guard-plain-${stamp}@test.local`))).toBeNull();
  });

  it("refuses once the role is removed server-side, even with a token that still claims it", async () => {
    const c = await signIn(`guard-admin-${stamp}@test.local`);
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
