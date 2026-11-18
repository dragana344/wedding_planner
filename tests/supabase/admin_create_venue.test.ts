import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { venueActionCore, venueSchemas, VENUE_EMAIL_TAKEN_ERROR } from "@/lib/admin/venue-actions-core";
import { acceptVenueTerms, clearMustChangePassword, onboardingStep, termsUpdatePending, venueOwnerName, verifyAccountPassword } from "@/lib/venue/onboarding";
import { LEGAL_VERSION } from "@/lib/legal/facts";

// Admin "Нов локал" (public signup is closed) and the venue's first-login
// steps that follow it (lib/venue/onboarding.ts).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad01", requestId: "req-create-venue" };
const created: { venueId: string; userId: string }[] = [];
let planId: string | null = null;

afterAll(async () => {
  for (const c of created) {
    await admin.from("venues").delete().eq("id", c.venueId);
    await admin.auth.admin.deleteUser(c.userId);
  }
  if (planId) await admin.from("plans").delete().eq("id", planId);
});

async function createOne(overrides: Partial<{ phone: string; planId: string }> = {}) {
  const email = `admin-created-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const input = venueSchemas.create.parse({
    venueName: "  Ресторан Езеро  ",
    ownerName: "Марија Петрова",
    email: email.toUpperCase(),
    planId: overrides.planId ?? (await admin.from("plans").select("id").eq("is_default", true).single()).data!.id,
    ...(overrides.phone ? { phone: overrides.phone } : {}),
  });
  const result = await venueActionCore.create(input, ctx);
  created.push({ venueId: result.data.venueId, userId: result.audit.targetId as string });
  return { email, input, result };
}

describe("admin: create venue", () => {
  it("creates the account, the venue on the chosen plan and the owner, and audits it", async () => {
    planId = (await admin.from("plans").insert({ name: `Create plan ${Date.now()}` }).select("id").single()).data!.id;
    const { email, result } = await createOne({ phone: "070 123 456", planId: planId! });
    const { venueId, loginPassword, ownerPassword } = result.data;

    expect(result.data.email).toBe(email);
    expect(loginPassword.length).toBeGreaterThanOrEqual(10);
    expect(ownerPassword.length).toBeGreaterThanOrEqual(10);
    expect(ownerPassword).not.toBe(loginPassword);
    expect(result.audit).toEqual({
      action: "venue_created_by_admin",
      venueId,
      targetId: expect.any(String),
      details: { plan_id: planId, email_sent: result.data.emailSent },
    });

    const venue = (await admin.from("venues").select("name, phone, plan_id, terms_version").eq("id", venueId).single()).data!;
    expect(venue).toEqual({ name: "Ресторан Езеро", phone: "070 123 456", plan_id: planId, terms_version: null });

    const { data: user } = await admin.auth.admin.getUserById(result.audit.targetId as string);
    expect(user.user!.email).toBe(email);
    expect(user.user!.email_confirmed_at).not.toBeNull();
    expect(user.user!.app_metadata.must_change_password).toBe(true);
    expect((await admin.from("venue_staff").select("venue_id").eq("user_id", user.user!.id).single()).data!.venue_id).toBe(venueId);

    // Both generated passwords work: the sign-in one and the owner's manager login.
    const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await anon.auth.signInWithPassword({ email, password: loginPassword })).error).toBeNull();
    const verify = await admin.rpc("verify_venue_manager", { p_venue_id: venueId, p_name: "Марија Петрова", p_password: ownerPassword });
    expect(verify.data![0]).toMatchObject({ error_code: null, is_owner: true });
    expect(await venueOwnerName(venueId)).toBe("Марија Петрова");
  });

  it("uses the default plan and no phone when none is given", async () => {
    const { result } = await createOne();
    const defaultPlan = (await admin.from("plans").select("id").eq("is_default", true).single()).data!.id;
    expect((await admin.from("venues").select("phone, plan_id").eq("id", result.data.venueId).single()).data).toEqual({ phone: null, plan_id: defaultPlan });
  });

  it("refuses an email that already has an account, in Macedonian, and opens nothing", async () => {
    const { email, input } = await createOne();
    // Counted by this test's own venue name: other test files share the database.
    const venueName = `Друг локал ${email}`;
    await expect(venueActionCore.create({ ...input, email: email.toLowerCase(), venueName }, ctx)).rejects.toThrow(VENUE_EMAIL_TAKEN_ERROR);
    expect((await admin.from("venues").select("id", { count: "exact", head: true }).eq("name", venueName)).count).toBe(0);
  });

  it("requires the venue name, owner name, a valid email and a plan", () => {
    const ok = { venueName: "Сала", ownerName: "Име", email: "a@b.mk", planId: "00000000-0000-4000-8000-000000000001" };
    expect(venueSchemas.create.safeParse(ok).success).toBe(true);
    expect(venueSchemas.create.safeParse({ ...ok, venueName: "  " }).error?.issues[0].message).toBe("Внесете име на локалот.");
    expect(venueSchemas.create.safeParse({ ...ok, ownerName: "" }).error?.issues[0].message).toBe("Внесете име на сопственикот.");
    expect(venueSchemas.create.safeParse({ ...ok, email: "не-е-пошта" }).error?.issues[0].message).toBe("Внесете важечка е-пошта.");
    expect(venueSchemas.create.safeParse({ ...ok, planId: undefined }).success).toBe(false);
  });
});

describe("venue first login", () => {
  it("asks for the password first, then the terms, then nothing", async () => {
    const { result } = await createOne();
    const userId = result.audit.targetId as string;
    const venueId = result.data.venueId;
    const termsOf = async () => (await admin.from("venues").select("terms_version").eq("id", venueId).single()).data!.terms_version as string | null;
    const userOf = async () => (await admin.auth.admin.getUserById(userId)).data.user!;

    expect(onboardingStep(await userOf(), await termsOf())).toBe("password");

    await clearMustChangePassword(userId);
    const cleared = await userOf();
    expect(cleared.app_metadata.must_change_password).toBe(false);
    expect(cleared.app_metadata.provider).toBe("email"); // merged, not replaced
    expect(onboardingStep(cleared, await termsOf())).toBe("terms");

    expect(await acceptVenueTerms(venueId)).toEqual({ firstAcceptance: true });
    const venue = (await admin.from("venues").select("terms_version, terms_accepted_at").eq("id", venueId).single()).data!;
    expect(venue.terms_version).toBe(LEGAL_VERSION);
    expect(venue.terms_accepted_at).not.toBeNull();
    expect(onboardingStep(cleared, venue.terms_version)).toBeNull();

    // Accepting again keeps the timestamp and is not a "first" acceptance (no tour).
    expect(await acceptVenueTerms(venueId)).toEqual({ firstAcceptance: false });
    expect((await admin.from("venues").select("terms_accepted_at").eq("id", venueId).single()).data!.terms_accepted_at).toBe(venue.terms_accepted_at);
  });

  it("verifyAccountPassword checks the venue's own sign-in password (terms for a venue with no owner login)", async () => {
    const { email, result } = await createOne();
    expect(await verifyAccountPassword(email, result.data.loginPassword)).toBe(true);
    expect(await verifyAccountPassword(email, "not-the-password-1")).toBe(false);
  });

  it("asks again when the terms version changes — a banner, not a blocking screen — without restarting the tour", async () => {
    const { result } = await createOne();
    const venueId = result.data.venueId;
    await admin.from("venues").update({ terms_version: "0.9", terms_accepted_at: new Date().toISOString() }).eq("id", venueId);
    expect(onboardingStep({ app_metadata: {} }, "0.9")).toBeNull();
    expect(termsUpdatePending("0.9")).toBe(true);
    expect(termsUpdatePending(null)).toBe(false);
    expect(termsUpdatePending(LEGAL_VERSION)).toBe(false);
    expect(await acceptVenueTerms(venueId)).toEqual({ firstAcceptance: false });
    expect((await admin.from("venues").select("terms_version").eq("id", venueId).single()).data!.terms_version).toBe(LEGAL_VERSION);
  });
});
