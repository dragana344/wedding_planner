import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { planActionCore } from "@/lib/admin/plan-actions-core";
import { FEATURE_KEYS, featureDef } from "@/lib/entitlements/features";

// Task 3.4 (spec §5): plan CRUD, feature/limit editing, make-default and
// delete refusals. Runs against the shared local test DB directly through
// planActionCore (no Next.js request context), same pattern as
// tests/supabase/admin_venue_actions.test.ts.
//
// Test isolation (controller ruling): this DB is shared by 4 parallel
// sessions. Never touch a plan this file didn't create, except for the
// default flag itself, which this file restores to exactly the id it read
// at the start of the "moves the default flag" test, in a try/finally, so a
// mid-test failure never leaves another session's expected default ("Стандарден")
// unset.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad02", requestId: null };
const created: string[] = [];

afterAll(async () => {
  await admin.from("venues").delete().eq("name", "Plan Action Venue 3.4");
  if (created.length) await admin.from("plans").delete().in("id", created);
});

describe("plan actions (spec §5, task 3.4)", () => {
  it("creates a plan with every switch off and every limit enabled/unlimited (storage_gb=5, photo_retention_days=15), then edits its features", async () => {
    const { data } = await planActionCore.create({ name: `Basic ${Date.now()}`, description: null, sortOrder: 1, isPublic: false }, ctx);
    created.push(data.id);

    const { data: rows } = await admin.from("plan_features").select("feature_key, enabled, limit_value").eq("plan_id", data.id);
    expect(rows).toHaveLength(FEATURE_KEYS.length);
    for (const r of rows!) {
      const isLimit = featureDef(r.feature_key as (typeof FEATURE_KEYS)[number]).kind === "limit";
      expect(r.enabled, `${r.feature_key} enabled`).toBe(isLimit);
      if (r.feature_key === "storage_gb") expect(r.limit_value).toBe(5);
      else if (r.feature_key === "photo_retention_days") expect(r.limit_value).toBe(15);
      else expect(r.limit_value).toBeNull();
    }

    await planActionCore.setFeatures(
      {
        planId: data.id,
        features: [
          { featureKey: "invitation", enabled: true, limitValue: null },
          { featureKey: "max_guests", enabled: true, limitValue: 150 },
        ],
      },
      ctx
    );
    const { data: after } = await admin
      .from("plan_features")
      .select("feature_key, enabled, limit_value")
      .eq("plan_id", data.id)
      .in("feature_key", ["invitation", "max_guests", "seating"]);
    expect(after).toEqual(
      expect.arrayContaining([
        { feature_key: "invitation", enabled: true, limit_value: null },
        { feature_key: "max_guests", enabled: true, limit_value: 150 },
        { feature_key: "seating", enabled: false, limit_value: null },
      ])
    );
  });

  it("updates name, description, sort order and isPublic", async () => {
    const { data } = await planActionCore.create({ name: `Editable ${Date.now()}`, description: null, sortOrder: 1, isPublic: false }, ctx);
    created.push(data.id);
    const newName = `Renamed ${Date.now()}`;
    await planActionCore.update({ planId: data.id, name: newName, description: "опис", sortOrder: 5, isPublic: true }, ctx);
    const { data: row } = await admin.from("plans").select("name, description, sort_order, is_public").eq("id", data.id).single();
    expect(row).toEqual({ name: newName, description: "опис", sort_order: 5, is_public: true });
  });

  it("refuses a duplicate plan name on create and on update", async () => {
    const name = `Dup ${Date.now()}`;
    const { data: first } = await planActionCore.create({ name, description: null, sortOrder: 1, isPublic: false }, ctx);
    created.push(first.id);
    await expect(planActionCore.create({ name, description: null, sortOrder: 1, isPublic: false }, ctx)).rejects.toThrow("Веќе постои ниво со тоа име.");

    const { data: second } = await planActionCore.create({ name: `Other ${Date.now()}`, description: null, sortOrder: 1, isPublic: false }, ctx);
    created.push(second.id);
    await expect(planActionCore.update({ planId: second.id, name, description: null, sortOrder: 1, isPublic: false }, ctx)).rejects.toThrow(
      "Веќе постои ниво со тоа име."
    );
  });

  it("refuses to update, set features on, or delete a plan that doesn't exist", async () => {
    const missingId = "22222222-3333-4000-8000-444444444444";
    await expect(planActionCore.update({ planId: missingId, name: "Х", description: null, sortOrder: 0, isPublic: false }, ctx)).rejects.toThrow(
      "Нивото не постои."
    );
    await expect(planActionCore.setFeatures({ planId: missingId, features: [] }, ctx)).rejects.toThrow("Нивото не постои.");
    await expect(planActionCore.remove({ planId: missingId }, ctx)).rejects.toThrow("Нивото не постои.");
  });

  it("refuses to delete a plan in use or the default plan", async () => {
    const id = created[0];
    await admin.from("venues").insert({ name: "Plan Action Venue 3.4", plan_id: id });
    await expect(planActionCore.remove({ planId: id }, ctx)).rejects.toThrow("Нивото го користат сали. Прво преместете ги.");
    const { data: def } = await admin.from("plans").select("id").eq("is_default", true).single();
    await expect(planActionCore.remove({ planId: def!.id }, ctx)).rejects.toThrow("Стандардното ниво не може да се избрише.");
  });

  it("moves the default flag atomically and restores the previous default", async () => {
    const { data: before } = await admin.from("plans").select("id").eq("is_default", true).single();
    const previousDefaultId = before!.id;
    try {
      await planActionCore.makeDefault({ planId: created[0] }, ctx);
      const { data } = await admin.from("plans").select("id").eq("is_default", true);
      expect(data).toEqual([{ id: created[0] }]);
    } finally {
      // Restore promptly: other sessions' tests expect "Стандарден" to be
      // the default (controller ruling — never leave the shared DB's
      // default flag on a plan this file created).
      await planActionCore.makeDefault({ planId: previousDefaultId }, ctx);
      const { data: restored } = await admin.from("plans").select("id").eq("is_default", true);
      expect(restored).toEqual([{ id: previousDefaultId }]);
    }
  });

  it("makeDefault refuses a plan that doesn't exist (RPC raises, no default is cleared)", async () => {
    const { data: before } = await admin.from("plans").select("id").eq("is_default", true).single();
    const missingId = "33333333-4444-4000-8000-555555555555";
    await expect(planActionCore.makeDefault({ planId: missingId }, ctx)).rejects.toThrow("Нивото не постои.");
    const { data: after } = await admin.from("plans").select("id").eq("is_default", true).single();
    expect(after!.id).toBe(before!.id);
  });
});
