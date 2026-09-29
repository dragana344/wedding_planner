// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { provisionVenueForUser, recordTermsAcceptance } from "@/lib/venue/provisioning";
import { LEGAL_VERSION } from "@/lib/legal/facts";

// COMP-001 / R1-06 (migration 0046): signup records which Terms (incl. DPA)
// version the venue accepted and when; only the server can write it.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const stamp = Date.now();
const email = `terms-${stamp}@test.local`;
const password = "test-password-123";
let userId: string;
let venueId: string;

afterAll(async () => {
  if (venueId) await admin.from("venues").delete().eq("id", venueId);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("terms acceptance (0046)", () => {
  it("records version and time once; a retried signup keeps the first timestamp", async () => {
    const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    userId = data!.user!.id;
    venueId = (await provisionVenueForUser(userId, `Terms venue ${stamp}`)).venue_id;

    const before = await admin.from("venues").select("terms_version, terms_accepted_at").eq("id", venueId).single();
    expect(before.data).toEqual({ terms_version: null, terms_accepted_at: null });

    await recordTermsAcceptance(venueId, LEGAL_VERSION);
    const first = (await admin.from("venues").select("terms_version, terms_accepted_at").eq("id", venueId).single()).data!;
    expect(first.terms_version).toBe(LEGAL_VERSION);
    expect(Date.now() - new Date(first.terms_accepted_at!).getTime()).toBeLessThan(60_000);

    await recordTermsAcceptance(venueId, LEGAL_VERSION);
    const again = (await admin.from("venues").select("terms_version, terms_accepted_at").eq("id", venueId).single()).data!;
    expect(again).toEqual(first);
  });

  it("rejects a version without a timestamp", async () => {
    const { error } = await admin.from("venues").update({ terms_accepted_at: null }).eq("id", venueId);
    expect(error?.message).toMatch(/venues_terms_acceptance_complete/);
  });

  it("staff can still rename their venue but cannot write the acceptance record", async () => {
    const staff = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    await staff.auth.signInWithPassword({ email, password });

    const renamed = await staff.from("venues").update({ name: `Renamed ${stamp}` }).eq("id", venueId).select("name");
    expect(renamed.error).toBeNull();
    expect(renamed.data).toEqual([{ name: `Renamed ${stamp}` }]);

    const forged = await staff
      .from("venues")
      .update({ terms_version: "9.9", terms_accepted_at: new Date().toISOString() })
      .eq("id", venueId)
      .select("id");
    expect(forged.error?.code).toBe("42501");

    const row = (await admin.from("venues").select("terms_version").eq("id", venueId).single()).data!;
    expect(row.terms_version).toBe(LEGAL_VERSION);
  });
});
