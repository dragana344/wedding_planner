import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listPackagesForDisplay } from "@/lib/entitlements/packages";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function features(name: string) {
  const { data: plan } = await admin.from("plans").select("id, is_default, is_public").eq("name", name).single();
  const { data } = await admin.from("plan_features").select("feature_key, enabled, limit_value").eq("plan_id", plan!.id);
  return { isDefault: plan!.is_default, isPublic: plan!.is_public, f: Object.fromEntries(data!.map((r) => [r.feature_key, r])) };
}

describe("seeded packages (0051)", () => {
  it("creates START..ULTRA with every catalogue key", async () => {
    for (const name of ["START", "PREMIUM", "PREMIUM+", "ULTRA"]) {
      const { isDefault, f } = await features(name);
      expect(isDefault, name).toBe(false);
      expect(Object.keys(f), name).toHaveLength(26);
    }
  });
  it("sets storage and retention per package", async () => {
    const expected: Record<string, [number, number]> = { START: [5, 15], PREMIUM: [20, 30], "PREMIUM+": [50, 40], ULTRA: [100, 60] };
    for (const [name, [gb, days]] of Object.entries(expected)) {
      const { f } = await features(name);
      expect(f.storage_gb.limit_value, name).toBe(gb);
      expect(f.photo_retention_days.limit_value, name).toBe(days);
    }
    expect((await features("START")).f.video_greetings.enabled).toBe(false);
    expect((await features("PREMIUM")).f.video_greetings.enabled).toBe(true);
  });
  it("keeps Стандарден as the default plan", async () => {
    expect((await features("Стандарден")).isDefault).toBe(true);
  });
});

describe("plans.is_public (0052)", () => {
  it("marks START..ULTRA public", async () => {
    for (const name of ["START", "PREMIUM", "PREMIUM+", "ULTRA"]) {
      expect((await features(name)).isPublic, name).toBe(true);
    }
  });
  it("keeps Стандарден not public", async () => {
    expect((await features("Стандарден")).isPublic).toBe(false);
  });
});

describe("listPackagesForDisplay (0052: is_public gates couple visibility)", () => {
  let hiddenPlanId: string;
  const hiddenName = `Hidden ${Date.now()}`;

  beforeAll(async () => {
    // A custom/negotiated admin plan, or a stray test fixture — either way
    // not one of the pricing-slide packages, so it must never reach
    // /couple/packages just because a `plans` row exists.
    hiddenPlanId = (
      await admin.from("plans").insert({ name: hiddenName, is_public: false }).select("id").single()
    ).data!.id;
  });
  afterAll(async () => {
    await admin.from("plans").delete().eq("id", hiddenPlanId);
  });

  it("returns only the public packages, not the default plan or a non-public plan", async () => {
    const packages = await listPackagesForDisplay();
    const names = packages.map((p) => p.name);
    expect(names).toEqual(expect.arrayContaining(["START", "PREMIUM", "PREMIUM+", "ULTRA"]));
    expect(names).not.toContain("Стандарден");
    expect(names).not.toContain(hiddenName);
  });
});
