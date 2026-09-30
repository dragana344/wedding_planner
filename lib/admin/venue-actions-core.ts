import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { deleteVenueAccount } from "@/lib/privacy/erase";
import { FEATURE_KEYS, featureDef, type FeatureKey } from "@/lib/entitlements/features";

// Core logic for every venue Server Action (task 3.3). Kept apart from
// app/admin/(panel)/venues/actions.ts so it can be exercised directly from a
// DB test, without a Next.js request context (no headers()/cookies(), no
// "use server" boundary) — actions.ts just wraps each of these in
// adminAction (guard → validate → run → audit).

const uuid = z.string().uuid();
const featureKey = z.enum(FEATURE_KEYS as unknown as [string, ...string[]]);
const db = () => createServiceRoleClient();
// revalidatePath throws outside a request (e.g. this module's own DB test
// calls venueActionCore directly, with no Next.js render/request under it).
const revalidatePathSafe = (p: string) => {
  try {
    revalidatePath(p);
  } catch {
    /* outside a request (tests) */
  }
};

// `data?: T | null` (not just `T`) because a Postgrest/Auth response's data
// field is typed as `T | null` even on success (e.g. `.maybeSingle()` when
// nothing matches) and is always `null` on the failure branch — narrowing to
// non-nullable `T` here would make TS reject the real client return types.
async function check<T>(p: PromiseLike<{ error: unknown; data?: T | null }>): Promise<T> {
  const { error, data } = await p;
  if (error) throw error;
  return data as T;
}

/**
 * Refuses a staff action (password reset, MFA removal, sign-out) unless the
 * target user id is actually staff of this venue. Without this, an admin
 * form that only carries a raw user id could be pointed at an arbitrary
 * user's id (or the admin's own), acting on an account with no relation to
 * the venue being managed. Throws a plain Error (user-facing, per
 * lib/api/handler.ts's isUserFacingError) so adminAction relays it to the UI
 * unchanged instead of masking it as "Акцијата не успеа.".
 */
async function requireVenueStaff(venueId: string, userId: string): Promise<void> {
  const { data, error } = await db().from("venue_staff").select("user_id").eq("venue_id", venueId).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Корисникот не е вработен во оваа сала.");
}

/**
 * Updates the venue row and throws a user-facing error if the id matches no
 * row — `.select("id")` reads back what the update actually touched, so a
 * mistyped/raced/deleted venue id gets a clear refusal instead of a
 * silent no-op that the admin reads as success.
 */
async function updateVenueOrThrow(venueId: string, patch: Record<string, unknown>): Promise<void> {
  const rows = await check<{ id: string }[]>(db().from("venues").update(patch).eq("id", venueId).select("id"));
  if (!rows || rows.length === 0) throw new Error("Салата не постои.");
}

export const venueSchemas = {
  rename: z.object({ venueId: uuid, name: z.string().trim().min(1, "Внесете име.").max(200) }),
  setPlan: z.object({ venueId: uuid, planId: uuid }),
  saveOverride: z.object({
    venueId: uuid,
    featureKey,
    enabled: z.boolean().nullable(),
    limitOverride: z.boolean(),
    limitValue: z
      .number()
      .int("Лимитот мора да е цел број од 0 до 1.000.000.")
      .min(0, "Лимитот мора да е цел број од 0 до 1.000.000.")
      .max(1_000_000, "Лимитот мора да е цел број од 0 до 1.000.000.")
      .nullable(),
    note: z.string().max(1000, "Белешката е предолга.").nullable(),
  }),
  staff: z.object({ venueId: uuid, userId: uuid }),
  block: z.object({ venueId: uuid, reason: z.string().trim().min(1, "Внесете причина.").max(1000) }),
  unblock: z.object({ venueId: uuid }),
  remove: z.object({ venueId: uuid, confirmName: z.string() }),
};

export const venueActionCore = {
  // ctx (AdminContext) is required by every core function's shared shape —
  // adminAction always calls `run(input, ctx)` positionally (lib/admin/
  // actions.ts) — even where this particular action has no use for it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async rename(i: z.infer<typeof venueSchemas.rename>, _ctx: AdminContext) {
    await updateVenueOrThrow(i.venueId, { name: i.name });
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_venue_renamed", venueId: i.venueId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async setPlan(i: z.infer<typeof venueSchemas.setPlan>, _ctx: AdminContext) {
    const before = await check<{ plan_id: string } | null>(db().from("venues").select("plan_id").eq("id", i.venueId).maybeSingle());
    if (!before) throw new Error("Салата не постои.");
    await updateVenueOrThrow(i.venueId, { plan_id: i.planId });
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return {
      data: null,
      audit: { action: "admin_venue_plan_changed", venueId: i.venueId, details: { plan_from: before.plan_id, plan_to: i.planId } },
    };
  },

  async saveOverride(i: z.infer<typeof venueSchemas.saveOverride>, ctx: AdminContext) {
    // Defensive server-side clamp, independent of the client: a switch
    // feature (e.g. "seating") has no limit of its own, so a limit override
    // for it is meaningless and must never reach the row or the audit trail
    // as if it were real, regardless of what the request body claims.
    const isLimitFeature = featureDef(i.featureKey as FeatureKey).kind === "limit";
    const limitOverride = isLimitFeature && i.limitOverride;
    const limitValue = limitOverride ? i.limitValue : null;

    if (i.enabled === null && !limitOverride) {
      await check(db().from("venue_feature_overrides").delete().eq("venue_id", i.venueId).eq("feature_key", i.featureKey));
    } else {
      await check(
        db()
          .from("venue_feature_overrides")
          .upsert({
            venue_id: i.venueId,
            feature_key: i.featureKey,
            enabled: i.enabled,
            limit_override: limitOverride,
            limit_value: limitValue,
            note: i.note,
            updated_at: new Date().toISOString(),
            updated_by: ctx.adminUserId,
          })
      );
    }
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return {
      data: null,
      audit: {
        action: "admin_venue_override_saved",
        venueId: i.venueId,
        details: { feature: i.featureKey, enabled: i.enabled, limit_override: limitOverride, limit: limitValue },
      },
    };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async block(i: z.infer<typeof venueSchemas.block>, _ctx: AdminContext) {
    await updateVenueOrThrow(i.venueId, { blocked_at: new Date().toISOString(), blocked_reason: i.reason });
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    // Never put the reason's own text in the audit row (constraints.md: no
    // free text in audit details) — only its length.
    return { data: null, audit: { action: "admin_venue_blocked", venueId: i.venueId, details: { reason_length: i.reason.length } } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async unblock(i: z.infer<typeof venueSchemas.unblock>, _ctx: AdminContext) {
    await updateVenueOrThrow(i.venueId, { blocked_at: null, blocked_reason: null });
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_venue_unblocked", venueId: i.venueId } };
  },

  async remove(i: z.infer<typeof venueSchemas.remove>, ctx: AdminContext) {
    const { data: venue } = await db().from("venues").select("name").eq("id", i.venueId).single();
    if (!venue || venue.name !== i.confirmName) throw new Error("Внесете го точното име на салата.");
    const deleted = await deleteVenueAccount(i.venueId, { actorId: ctx.adminUserId, requestId: ctx.requestId });
    if (!deleted) throw new Error("Салата не постои.");
    // No top-level venueId: the row is gone by the time this audit entry is
    // written (audit_log has no FK to venues, so this is only a style
    // choice — deleteVenueAccount already wrote its own audit row for the
    // deletion itself; this one records *who* (the admin) asked for it).
    return { data: null, audit: { action: "admin_venue_deleted", details: { venue_id: i.venueId } } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async staffPasswordReset(i: z.infer<typeof venueSchemas.staff>, _ctx: AdminContext) {
    await requireVenueStaff(i.venueId, i.userId);
    const { user } = await check<{ user: { email?: string | null } | null }>(db().auth.admin.getUserById(i.userId));
    if (!user?.email) throw new Error("Корисникот нема е-пошта.");
    await check(db().auth.resetPasswordForEmail(user.email));
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_staff_password_reset_sent", venueId: i.venueId, targetId: i.userId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async staffRemoveMfa(i: z.infer<typeof venueSchemas.staff>, _ctx: AdminContext) {
    await requireVenueStaff(i.venueId, i.userId);
    const { factors } = await check<{ factors: { id: string }[] }>(db().auth.admin.mfa.listFactors({ userId: i.userId }));
    for (const f of factors ?? []) await check(db().auth.admin.mfa.deleteFactor({ userId: i.userId, id: f.id }));
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_staff_mfa_removed", venueId: i.venueId, targetId: i.userId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async staffSignOut(i: z.infer<typeof venueSchemas.staff>, _ctx: AdminContext) {
    await requireVenueStaff(i.venueId, i.userId);
    await check(db().rpc("admin_sign_out_user", { p_user_id: i.userId }));
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_staff_signed_out", venueId: i.venueId, targetId: i.userId } };
  },
};
