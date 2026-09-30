import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { toFeatureMap } from "@/lib/entitlements/server";
import type { FeatureMap } from "@/lib/entitlements/features";

export type PackageForDisplay = {
  id: string;
  name: string;
  description: string | null;
  features: FeatureMap;
};

type PlanRow = {
  id: string;
  name: string;
  description: string | null;
  plan_features: { feature_key: string; enabled: boolean; limit_value: number | null }[] | null;
};

/**
 * Plans for the couple-facing read-only packages page (admin dashboard spec
 * §4.4 / E3). Only plans marked `is_public` (0052) are returned — the
 * default plan, any admin-negotiated custom plan, and test fixtures are
 * platform-internal and must never leak to a couple just because a `plans`
 * row exists (review ruling on tasks 2.8/2.9). Ordered by sort_order, then
 * name for a stable order among equal sort_order values.
 */
export async function listPackagesForDisplay(): Promise<PackageForDisplay[]> {
  const { data, error } = await createServiceRoleClient()
    .from("plans")
    .select("id, name, description, plan_features(feature_key, enabled, limit_value)")
    .eq("is_public", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;

  return ((data ?? []) as PlanRow[]).map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    features: toFeatureMap(plan.plan_features ?? []),
  }));
}
