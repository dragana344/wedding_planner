import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { FEATURE_KEYS, featureDef, type FeatureKey } from "@/lib/entitlements/features";

// Core logic for every plan Server Action (task 3.4). Kept apart from
// app/admin/(panel)/plans/actions.ts so it can be exercised directly from a
// DB test, without a Next.js request context (no headers()/cookies(), no
// "use server" boundary) — actions.ts just wraps each of these in
// adminAction (guard → validate → run → audit). Same split as
// lib/admin/venue-actions-core.ts (task 3.3).

const db = () => createServiceRoleClient();
// revalidatePath throws outside a request (e.g. this module's own DB test
// calls planActionCore directly, with no Next.js render/request under it).
const revalidatePathSafe = (p: string) => {
  try {
    revalidatePath(p);
  } catch {
    /* outside a request (tests) */
  }
};

// `data?: T | null` (not just `T`) because a Postgrest response's data field
// is typed as `T | null` even on success — narrowing to non-nullable `T`
// here would make TS reject the real client return types.
async function check<T>(p: PromiseLike<{ error: unknown; data?: T | null }>): Promise<T> {
  const { error, data } = await p;
  if (error) throw error;
  return data as T;
}

const NAME_TAKEN = "Веќе постои ниво со тоа име.";
const NOT_FOUND = "Нивото не постои.";
const DEFAULT_UNDELETABLE = "Стандардното ниво не може да се избрише.";
const IN_USE = "Нивото го користат локали. Прво преместете ги.";

// Postgres unique_violation (plans.name is `unique`, 0048).
function throwIfUniqueViolation(error: { code?: string } | null): void {
  if (error) throw error.code === "23505" ? new Error(NAME_TAKEN) : error;
}

const uuid = z.string().uuid();
const featureKey = z.enum(FEATURE_KEYS as unknown as [string, ...string[]]);
const LIMIT_MSG = "Лимитот мора да е цел број од 0 до 1.000.000.";

export const planSchemas = {
  create: z.object({
    name: z.string().trim().min(1, "Внесете име.").max(100),
    description: z.string().max(1000, "Описот е предолг.").nullable(),
    sortOrder: z.number().int().min(0).max(1000),
    isPublic: z.boolean(),
  }),
  update: z.object({
    planId: uuid,
    name: z.string().trim().min(1, "Внесете име.").max(100),
    description: z.string().max(1000, "Описот е предолг.").nullable(),
    sortOrder: z.number().int().min(0).max(1000),
    isPublic: z.boolean(),
  }),
  setFeatures: z.object({
    planId: uuid,
    features: z
      .array(
        z.object({
          featureKey,
          enabled: z.boolean(),
          limitValue: z.number().int(LIMIT_MSG).min(0, LIMIT_MSG).max(1_000_000, LIMIT_MSG).nullable(),
        })
      )
      .max(FEATURE_KEYS.length),
  }),
  id: z.object({ planId: uuid }),
};

// New plan defaults (controller ruling on task 3.4, overrides the brief's
// "every feature locked with limit 0"): every switch starts off, and every
// limit feature starts *enabled* with no limit (unlimited) — a disabled or
// 0 max_rooms/max_active_events/max_guests would block all rooms, events or
// guests for any venue put on a brand-new plan before its features are set
// up. storage_gb and photo_retention_days are the two exceptions with a
// concrete starting value (5 GB / 15 days), matching the default plan's own
// seed values (0048).
function defaultFeatureRow(planId: string, key: FeatureKey): { plan_id: string; feature_key: FeatureKey; enabled: boolean; limit_value: number | null } {
  const isLimit = featureDef(key).kind === "limit";
  return {
    plan_id: planId,
    feature_key: key,
    enabled: isLimit,
    limit_value: !isLimit ? null : key === "storage_gb" ? 5 : key === "photo_retention_days" ? 15 : null,
  };
}

export const planActionCore = {
  // ctx (AdminContext) is required by every core function's shared shape —
  // adminAction always calls `run(input, ctx)` positionally — even where
  // this particular action has no use for it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async create(i: z.infer<typeof planSchemas.create>, _ctx: AdminContext) {
    const { data, error } = await db()
      .from("plans")
      .insert({ name: i.name, description: i.description, sort_order: i.sortOrder, is_public: i.isPublic })
      .select("id")
      .single();
    throwIfUniqueViolation(error);
    const planId = data!.id as string;
    await check(db().from("plan_features").insert(FEATURE_KEYS.map((k) => defaultFeatureRow(planId, k))));
    revalidatePathSafe("/admin/plans");
    return { data: { id: planId }, audit: { action: "admin_plan_created", targetId: planId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async update(i: z.infer<typeof planSchemas.update>, _ctx: AdminContext) {
    const { data, error } = await db()
      .from("plans")
      .update({ name: i.name, description: i.description, sort_order: i.sortOrder, is_public: i.isPublic })
      .eq("id", i.planId)
      .select("id");
    throwIfUniqueViolation(error);
    if (!data || data.length === 0) throw new Error(NOT_FOUND);
    revalidatePathSafe(`/admin/plans/${i.planId}`);
    return { data: null, audit: { action: "admin_plan_updated", targetId: i.planId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async setFeatures(i: z.infer<typeof planSchemas.setFeatures>, _ctx: AdminContext) {
    const { data: plan } = await db().from("plans").select("id").eq("id", i.planId).maybeSingle();
    if (!plan) throw new Error(NOT_FOUND);
    const byKey = new Map(i.features.map((f) => [f.featureKey as FeatureKey, f]));
    const rows = FEATURE_KEYS.map((k) => {
      const f = byKey.get(k);
      const isLimit = featureDef(k).kind === "limit";
      return { plan_id: i.planId, feature_key: k, enabled: f?.enabled ?? false, limit_value: isLimit ? f?.limitValue ?? null : null };
    });
    await check(db().from("plan_features").upsert(rows));
    revalidatePathSafe(`/admin/plans/${i.planId}`);
    return {
      data: null,
      audit: { action: "admin_plan_features_saved", targetId: i.planId, details: { enabled: rows.filter((r) => r.enabled).length } },
    };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(i: z.infer<typeof planSchemas.id>, _ctx: AdminContext) {
    const { data: plan } = await db().from("plans").select("is_default").eq("id", i.planId).maybeSingle();
    if (!plan) throw new Error(NOT_FOUND);
    if (plan.is_default) throw new Error(DEFAULT_UNDELETABLE);
    const { count } = await db().from("venues").select("id", { count: "exact", head: true }).eq("plan_id", i.planId);
    if ((count ?? 0) > 0) throw new Error(IN_USE);
    // The count check above and this delete are two round trips, so a venue
    // can in principle be pointed at this plan in between (venues.plan_id
    // references plans(id) on delete restrict, 0048) — map that race to the
    // same user-facing message instead of letting a raw foreign_key_violation
    // reach the admin UI.
    const { error: deleteError } = await db().from("plans").delete().eq("id", i.planId);
    if (deleteError) throw deleteError.code === "23503" ? new Error(IN_USE) : deleteError;
    revalidatePathSafe("/admin/plans");
    return { data: null, audit: { action: "admin_plan_deleted", targetId: i.planId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async makeDefault(i: z.infer<typeof planSchemas.id>, _ctx: AdminContext) {
    // Single RPC (0053), not a clear-then-set pair of updates from here: see
    // that migration's comment for why a two-statement version from the
    // client is unsafe (a failure between the two could zero out every
    // plan's is_default).
    const { error } = await db().rpc("admin_make_default_plan", { p_plan_id: i.planId });
    if (error) throw error.message?.includes("plan_not_found") ? new Error(NOT_FOUND) : error;
    revalidatePathSafe("/admin/plans");
    return { data: null, audit: { action: "admin_plan_made_default", targetId: i.planId } };
  },
};
