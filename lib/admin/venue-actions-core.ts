import "server-only";
import { randomBytes } from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { passwordResetRedirectTo } from "@/lib/admin/reset-redirect";
import { deleteVenueAccount } from "@/lib/privacy/erase";
import { FEATURE_KEYS, featureDef, type FeatureKey } from "@/lib/entitlements/features";
import { changeManagerPassword, markAdminPasswordReset } from "@/lib/venue/managers";
import { RETENTION_FACTS } from "@/lib/legal/facts";
import { MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_ERROR } from "@/lib/security/password";

// Core logic for every venue Server Action (task 3.3). Kept apart from
// app/admin/(panel)/venues/actions.ts so it can be exercised directly from a
// DB test, without a Next.js request context (no headers()/cookies(), no
// "use server" boundary) — actions.ts just wraps each of these in
// adminAction (guard → validate → run → audit).

const uuid = z.string().uuid();
/** 0172: "delete venue" schedules the deletion this many days later — the export window the terms/DPA state. */
export const VENUE_DELETION_DELAY_DAYS = RETENTION_FACTS.exportWindowAfterEndDays;
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
 * Refuses a staff action (password reset, sign-out) unless the
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
  if (!data) throw new Error("Корисникот не е вработен во овој локал.");
}

/** Same reasoning as requireVenueStaff, for a manager id instead of a user id. */
async function requireVenueManager(venueId: string, managerId: string): Promise<void> {
  const { data, error } = await db().from("venue_managers").select("id").eq("venue_id", venueId).eq("id", managerId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Менаџерот не припаѓа на овој локал.");
}

/**
 * Updates the venue row and throws a user-facing error if the id matches no
 * row — `.select("id")` reads back what the update actually touched, so a
 * mistyped/raced/deleted venue id gets a clear refusal instead of a
 * silent no-op that the admin reads as success.
 */
async function updateVenueOrThrow(venueId: string, patch: Record<string, unknown>): Promise<void> {
  const rows = await check<{ id: string }[]>(db().from("venues").update(patch).eq("id", venueId).select("id"));
  if (!rows || rows.length === 0) throw new Error("Локалот не постои.");
}

export const VENUE_EMAIL_TAKEN_ERROR = "Веќе постои сметка со оваа е-пошта.";

/** 16 random characters (letters, digits, - and _), shown to the admin once. */
function initialPassword(): string {
  return randomBytes(12).toString("base64url");
}

export const venueSchemas = {
  create: z.object({
    venueName: z.string({ error: "Внесете име на локалот." }).trim().min(1, "Внесете име на локалот.").max(200, "Името е предолго."),
    ownerName: z.string({ error: "Внесете име на сопственикот." }).trim().min(1, "Внесете име на сопственикот.").max(100, "Името е предолго."),
    email: z.string({ error: "Внесете важечка е-пошта." }).trim().toLowerCase().email("Внесете важечка е-пошта.").max(320),
    phone: z.string().trim().max(50, "Телефонот е предолг.").optional(),
    planId: z.string({ error: "Изберете ниво." }).uuid("Изберете ниво."),
  }),
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
  // The admin types in whatever password the caller dictates over the
  // phone, rather than generating one — reading out a random string
  // character by character isn't practical (app owner's call).
  manager: z.object({
    venueId: uuid,
    managerId: uuid,
    newPassword: z
      .string({ error: PASSWORD_LENGTH_ERROR })
      .min(MIN_PASSWORD_LENGTH, PASSWORD_LENGTH_ERROR)
      .max(200, "Лозинката може да има најмногу 200 знаци."),
  }),
  block: z.object({ venueId: uuid, reason: z.string().trim().min(1, "Внесете причина.").max(1000) }),
  unblock: z.object({ venueId: uuid }),
  remove: z.object({ venueId: uuid, confirmName: z.string() }),
  scheduleRemoval: z.object({ venueId: uuid, confirmName: z.string() }),
  cancelRemoval: z.object({ venueId: uuid }),
};

/** Reads the venue's name and deletion date; a missing venue is a user-facing refusal. */
async function venueForDeletion(venueId: string): Promise<{ name: string; deletion_scheduled_for: string | null }> {
  const venue = await check<{ name: string; deletion_scheduled_for: string | null } | null>(
    db().from("venues").select("name, deletion_scheduled_for").eq("id", venueId).maybeSingle()
  );
  if (!venue) throw new Error("Локалот не постои.");
  return venue;
}

export type CreatedVenue = {
  venueId: string;
  email: string;
  ownerName: string;
  /** The venue's sign-in password; it must be changed on the first login. */
  loginPassword: string;
  /** The owner's manager password (Поставки, owner-only actions). */
  ownerPassword: string;
  /** Whether the "set your password" email went out (email may not be set up). */
  emailSent: boolean;
};

export const venueActionCore = {
  // Public signup is closed (0173): the platform owner opens every venue
  // here. Same result as the old signup: an Auth user (email confirmed), the
  // venue on the chosen plan, its staff row and the owner's manager login
  // (provision_venue, 0175). The sign-in password carries
  // app_metadata.must_change_password, so the venue layout makes the owner
  // pick their own before anything else (lib/venue/onboarding.ts).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async create(i: z.infer<typeof venueSchemas.create>, _ctx: AdminContext) {
    const loginPassword = initialPassword();
    const ownerPassword = initialPassword();
    const { data, error } = await db().auth.admin.createUser({
      email: i.email,
      password: loginPassword,
      email_confirm: true,
      app_metadata: { must_change_password: true },
    });
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "email_exists" || code === "user_already_exists") throw new Error(VENUE_EMAIL_TAKEN_ERROR);
      throw error;
    }
    const userId = data.user.id;

    const { data: venueId, error: venueError } = await db().rpc("provision_venue", {
      p_user_id: userId,
      p_venue_name: i.venueName,
      p_owner_name: i.ownerName,
      p_owner_password: ownerPassword,
      p_address: null,
      p_room_names: [],
      p_phone: i.phone || null,
      p_plan_id: i.planId,
    });
    if (venueError) {
      await db().auth.admin.deleteUser(userId);
      throw venueError;
    }

    // Same link as "Заборавена лозинка?". Email may not be set up yet; the
    // admin still has the password on screen, so this never fails the action.
    let emailSent = false;
    try {
      const redirectTo = await passwordResetRedirectTo();
      const { error: resetError } = await db().auth.resetPasswordForEmail(i.email, redirectTo ? { redirectTo } : undefined);
      emailSent = !resetError;
    } catch {
      emailSent = false;
    }

    revalidatePathSafe("/admin/venues");
    const created: CreatedVenue = { venueId: venueId as string, email: i.email, ownerName: i.ownerName, loginPassword, ownerPassword, emailSent };
    return {
      data: created,
      audit: { action: "venue_created_by_admin", venueId: venueId as string, targetId: userId, details: { plan_id: i.planId, email_sent: emailSent } },
    };
  },

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
    if (!before) throw new Error("Локалот не постои.");
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

  // 0172: the admin's "delete venue" only schedules the deletion; the daily
  // retention cron deletes the venue once the date passes
  // (runScheduledVenueDeletions). Meanwhile the venue panel shows the date
  // and asks the venue to download its data.
  async scheduleRemoval(i: z.infer<typeof venueSchemas.scheduleRemoval>, ctx: AdminContext) {
    const venue = await venueForDeletion(i.venueId);
    if (venue.name !== i.confirmName) throw new Error("Внесете го точното име на локалот.");
    if (venue.deletion_scheduled_for) throw new Error("Бришењето е веќе закажано.");
    const scheduledFor = new Date(Date.now() + VENUE_DELETION_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await updateVenueOrThrow(i.venueId, { deletion_scheduled_for: scheduledFor, deletion_scheduled_by: ctx.adminUserId });
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return {
      data: { scheduledFor },
      audit: { action: "venue_deletion_scheduled", venueId: i.venueId, details: { scheduled_for: scheduledFor } },
    };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async cancelRemoval(i: z.infer<typeof venueSchemas.cancelRemoval>, _ctx: AdminContext) {
    const venue = await venueForDeletion(i.venueId);
    if (!venue.deletion_scheduled_for) throw new Error("Бришењето не е закажано.");
    await updateVenueOrThrow(i.venueId, { deletion_scheduled_for: null, deletion_scheduled_by: null });
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return {
      data: null,
      audit: { action: "venue_deletion_cancelled", venueId: i.venueId, details: { scheduled_for: venue.deletion_scheduled_for } },
    };
  },

  // "Избриши веднаш": only once a deletion is already scheduled (so the
  // venue was told), and behind the same typed-name confirmation.
  async remove(i: z.infer<typeof venueSchemas.remove>, ctx: AdminContext) {
    const venue = await venueForDeletion(i.venueId);
    if (venue.name !== i.confirmName) throw new Error("Внесете го точното име на локалот.");
    if (!venue.deletion_scheduled_for) throw new Error("Прво закажете го бришењето.");
    const deleted = await deleteVenueAccount(i.venueId, { actorId: ctx.adminUserId, requestId: ctx.requestId });
    if (!deleted) throw new Error("Локалот не постои.");
    // No top-level venueId: the row is gone by the time this audit entry is
    // written (audit_log has no FK to venues, so this is only a style
    // choice — deleteVenueAccount already wrote its own audit row for the
    // deletion itself; this one records *who* (the admin) asked for it).
    return { data: null, audit: { action: "admin_venue_deleted", details: { venue_id: i.venueId, immediate: true } } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async staffPasswordReset(i: z.infer<typeof venueSchemas.staff>, _ctx: AdminContext) {
    await requireVenueStaff(i.venueId, i.userId);
    const { user } = await check<{ user: { email?: string | null } | null }>(db().auth.admin.getUserById(i.userId));
    if (!user?.email) throw new Error("Корисникот нема е-пошта.");
    const redirectTo = await passwordResetRedirectTo();
    await check(db().auth.resetPasswordForEmail(user.email, redirectTo ? { redirectTo } : undefined));
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_staff_password_reset_sent", venueId: i.venueId, targetId: i.userId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async staffSignOut(i: z.infer<typeof venueSchemas.staff>, _ctx: AdminContext) {
    await requireVenueStaff(i.venueId, i.userId);
    await check(db().rpc("admin_sign_out_user", { p_user_id: i.userId }));
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_staff_signed_out", venueId: i.venueId, targetId: i.userId } };
  },

  // The app owner wants manager/owner password recovery to go through a
  // phone call to support rather than a self-service email link (no email
  // is stored per manager, only one per venue; the earlier email-link
  // flow was removed in 0103). The admin sets whatever password the caller
  // dictates; the value itself never goes in the audit row.
  //
  // Security review #4: the caller's identity is only as good as support's
  // own judgment (no typed confirmation here, unlike venue deletion) — an
  // accepted tradeoff at the current scale, where admins personally know
  // every owner. What this *does* add is an owner-facing signal: the manager
  // sees a one-time "your password was reset by support on [date]" notice
  // on next elevation, so a reset the owner didn't expect is at least
  // visible to them, not just buried in an audit row nobody reads day to day.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async managerPasswordReset(i: z.infer<typeof venueSchemas.manager>, _ctx: AdminContext) {
    await requireVenueManager(i.venueId, i.managerId);
    await changeManagerPassword(i.managerId, i.newPassword);
    await markAdminPasswordReset(i.managerId);
    revalidatePathSafe(`/admin/venues/${i.venueId}`);
    return { data: null, audit: { action: "admin_manager_password_reset", venueId: i.venueId, targetId: i.managerId } };
  },
};
