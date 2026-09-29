import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

// SEC-017: "sign out everywhere" (scope global) revokes the refresh tokens of
// every session; after a password change, scope "others" keeps only the
// current one.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const email = `sign-out-scopes-${Date.now()}@test.local`;
const password = "test-password-123";
let userId: string;

async function signedIn() {
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function canRefresh(client: Awaited<ReturnType<typeof signedIn>>) {
  const { data } = await client.auth.getSession();
  const { error } = await createClient(url, anonKey, { auth: { persistSession: false } }).auth.refreshSession({
    refresh_token: data.session!.refresh_token,
  });
  return !error;
}

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = data.user.id;
});

afterAll(async () => {
  await admin.auth.admin.deleteUser(userId);
});

describe("venue staff sign-out scopes (SEC-017)", () => {
  it("global sign-out ends the session on the other device too", async () => {
    const laptop = await signedIn();
    const phone = await signedIn();
    await laptop.auth.signOut({ scope: "global" });
    expect(await canRefresh(phone)).toBe(false);
  });

  it("after a password change, other devices are signed out and this one stays", async () => {
    const thisBrowser = await signedIn();
    const otherDevice = await signedIn();
    await thisBrowser.auth.signOut({ scope: "others" });
    expect(await canRefresh(otherDevice)).toBe(false);
    expect(await canRefresh(thisBrowser)).toBe(true);
  });
});
