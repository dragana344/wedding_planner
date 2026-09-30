import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { venueActionCore } from "@/lib/admin/venue-actions-core";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad01", requestId: "req-admin" };
let venueId: string;
let planId: string;

beforeAll(async () => {
  venueId = (await admin.from("venues").insert({ name: "Action Venue" }).select("id").single()).data!.id;
  planId = (await admin.from("plans").insert({ name: `Action plan ${Date.now()}` }).select("id").single()).data!.id;
});
afterAll(async () => {
  await admin.from("venues").delete().eq("id", venueId);
  await admin.from("plans").delete().eq("id", planId);
});

describe("admin venue actions", () => {
  it("renames, changes plan and audits each change", async () => {
    const r1 = await venueActionCore.rename({ venueId, name: "Нова Сала" }, ctx);
    expect(r1.audit).toMatchObject({ action: "admin_venue_renamed", venueId });
    await venueActionCore.setPlan({ venueId, planId }, ctx);
    const { data } = await admin.from("venues").select("name, plan_id").eq("id", venueId).single();
    expect(data).toEqual({ name: "Нова Сала", plan_id: planId });
  });

  it("saves and clears an override", async () => {
    await venueActionCore.saveOverride({ venueId, featureKey: "reservations", enabled: true, limitOverride: false, limitValue: null, note: "договор" }, ctx);
    expect((await admin.from("venue_feature_overrides").select("enabled, note, updated_by").eq("venue_id", venueId).single()).data).toEqual({ enabled: true, note: "договор", updated_by: ctx.adminUserId });
    await venueActionCore.saveOverride({ venueId, featureKey: "reservations", enabled: null, limitOverride: false, limitValue: null, note: null }, ctx);
    expect((await admin.from("venue_feature_overrides").select("*").eq("venue_id", venueId)).data).toEqual([]);
  });

  it("blocks with a reason and unblocks", async () => {
    await venueActionCore.block({ venueId, reason: "неплатено" }, ctx);
    expect((await admin.from("venues").select("blocked_reason").eq("id", venueId).single()).data!.blocked_reason).toBe("неплатено");
    await venueActionCore.unblock({ venueId }, ctx);
    expect((await admin.from("venues").select("blocked_at").eq("id", venueId).single()).data!.blocked_at).toBeNull();
  });

  it("refuses deletion unless the typed name matches", async () => {
    await expect(venueActionCore.remove({ venueId, confirmName: "погрешно" }, ctx)).rejects.toThrow("Внесете го точното име на салата.");
  });

  it("refuses a staff action on a user who is not staff of the venue", async () => {
    // Any well-formed uuid works: the membership check must reject before
    // ever calling the Auth admin API, so this id need not belong to a real
    // user for the refusal to prove the guard runs.
    const strangerId = "11111111-2222-4000-8000-333333333333";
    await expect(venueActionCore.staffSignOut({ venueId, userId: strangerId }, ctx)).rejects.toThrow("не е вработен");
    await expect(venueActionCore.staffPasswordReset({ venueId, userId: strangerId }, ctx)).rejects.toThrow("не е вработен");
    await expect(venueActionCore.staffRemoveMfa({ venueId, userId: strangerId }, ctx)).rejects.toThrow("не е вработен");
  });

  it("refuses to touch a venue that doesn't exist", async () => {
    const missingId = "22222222-3333-4000-8000-444444444444";
    await expect(venueActionCore.rename({ venueId: missingId, name: "Нема" }, ctx)).rejects.toThrow("Салата не постои.");
    await expect(venueActionCore.setPlan({ venueId: missingId, planId }, ctx)).rejects.toThrow("Салата не постои.");
    await expect(venueActionCore.block({ venueId: missingId, reason: "тест" }, ctx)).rejects.toThrow("Салата не постои.");
    await expect(venueActionCore.unblock({ venueId: missingId }, ctx)).rejects.toThrow("Салата не постои.");
  });

  it("ignores a limit override on a switch feature (server-side clamp, not just the client's)", async () => {
    // "seating" is kind: "switch" (lib/entitlements/features.ts) — a
    // malicious or buggy caller sending limitOverride/limitValue for it must
    // never have those values stored or audited as if they were real.
    const r = await venueActionCore.saveOverride({ venueId, featureKey: "seating", enabled: true, limitOverride: true, limitValue: 999, note: null }, ctx);
    expect(r.audit).toMatchObject({ details: { limit_override: false, limit: null } });
    const { data } = await admin.from("venue_feature_overrides").select("limit_override, limit_value").eq("venue_id", venueId).eq("feature_key", "seating").single();
    expect(data).toEqual({ limit_override: false, limit_value: null });
    await admin.from("venue_feature_overrides").delete().eq("venue_id", venueId).eq("feature_key", "seating");
  });
});
