import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { FEATURES, featureDef, type FeatureKey } from "@/lib/entitlements/features";
import { regenerateEventPassword, generateRandomPassword } from "@/lib/venue/credentials";

// Core logic for every event Server Action (task 3.5). Kept apart from
// app/admin/(panel)/events/actions.ts so it can be exercised directly from a
// DB test, without a Next.js request context (no headers()/cookies(), no
// "use server" boundary) — actions.ts just wraps each of these in
// adminAction (guard → validate → run → audit). Same split as
// lib/admin/venue-actions-core.ts (task 3.3) and lib/admin/plan-actions-
// core.ts (task 3.4).
//
// D2: this module never reads guest/couple planning tables — the couple-
// access actions below go entirely through RPCs (admin_unlock_couple_login,
// regenerate_event_password) rather than querying the couple credentials
// table directly (tests/security/admin-static.test.ts bans that table name
// anywhere under lib/admin).

const db = () => createServiceRoleClient();
// revalidatePath throws outside a request (e.g. this module's own DB test
// calls eventActionCore directly, with no Next.js render/request under it).
const revalidatePathSafe = (p: string) => {
  try {
    revalidatePath(p);
  } catch {
    /* outside a request (tests) */
  }
};

// `data?: T | null` (not just `T`) because a Postgrest/RPC response's data
// field is typed as `T | null` even on success — narrowing to non-nullable
// `T` here would make TS reject the real client return types.
async function check<T>(p: PromiseLike<{ error: unknown; data?: T | null }>): Promise<T> {
  const { error, data } = await p;
  if (error) throw error;
  return data as T;
}

const NOT_FOUND = "Настанот не постои.";

const uuid = z.string().uuid();
const eventFeatureKey = z.enum(FEATURES.filter((f) => f.scope === "event").map((f) => f.key) as [FeatureKey, ...FeatureKey[]]);
const time = z
  .string()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Неважечко време.")
  .nullable();
const LIMIT_MSG = "Лимитот мора да е цел број од 0 до 1.000.000.";

export const eventSchemas = {
  update: z.object({
    eventId: uuid,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Неважечки датум."),
    startTime: time,
    endTime: time,
    status: z.enum(["preparation", "confirmed", "in_progress", "completed", "cancelled"]),
  }),
  saveOverride: z.object({
    eventId: uuid,
    featureKey: eventFeatureKey,
    enabled: z.boolean().nullable(),
    limitOverride: z.boolean(),
    limitValue: z.number().int(LIMIT_MSG).min(0, LIMIT_MSG).max(1_000_000, LIMIT_MSG).nullable(),
    note: z.string().max(1000, "Белешката е предолга.").nullable(),
  }),
  id: z.object({ eventId: uuid }),
};

/**
 * Looks up the venue an event belongs to, for the audit row and for
 * revalidatePath — and, since it 404s a missing event, doubles as the
 * existence check every action below needs before touching anything else.
 */
async function venueOfOrThrow(eventId: string): Promise<string> {
  const { data, error } = await db().from("events").select("venue_id").eq("id", eventId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(NOT_FOUND);
  return data.venue_id;
}

export const eventActionCore = {
  // ctx (AdminContext) is required by every core function's shared shape —
  // adminAction always calls `run(input, ctx)` positionally — even where
  // this particular action has no use for it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async update(i: z.infer<typeof eventSchemas.update>, _ctx: AdminContext) {
    const venueId = await venueOfOrThrow(i.eventId);
    // .select("id") reads back what the update actually touched: besides the
    // not-found guard above, the row could in principle be deleted between
    // that lookup and this write, and this still surfaces a clear refusal
    // instead of a silent no-op.
    const rows = await check<{ id: string }[]>(
      db()
        .from("events")
        .update({ event_date: i.date, start_time: i.startTime, end_time: i.endTime, status: i.status })
        .eq("id", i.eventId)
        .select("id")
    );
    if (!rows || rows.length === 0) throw new Error(NOT_FOUND);
    revalidatePathSafe(`/admin/events/${i.eventId}`);
    return { data: null, audit: { action: "admin_event_updated", eventId: i.eventId, venueId, details: { status: i.status } } };
  },

  async saveOverride(i: z.infer<typeof eventSchemas.saveOverride>, ctx: AdminContext) {
    const venueId = await venueOfOrThrow(i.eventId);
    // Defensive server-side clamp, independent of the client: a switch
    // feature (e.g. "seating") has no limit of its own, so a limit override
    // for it is meaningless and must never reach the row or the audit trail
    // as if it were real, regardless of what the request body claims. Same
    // rule as venueActionCore.saveOverride (task 3.3).
    const isLimitFeature = featureDef(i.featureKey).kind === "limit";
    const limitOverride = isLimitFeature && i.limitOverride;
    const limitValue = limitOverride ? i.limitValue : null;

    if (i.enabled === null && !limitOverride) {
      await check(db().from("event_feature_overrides").delete().eq("event_id", i.eventId).eq("feature_key", i.featureKey));
    } else {
      await check(
        db()
          .from("event_feature_overrides")
          .upsert({
            event_id: i.eventId,
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
    revalidatePathSafe(`/admin/events/${i.eventId}`);
    return {
      data: null,
      audit: {
        action: "admin_event_override_saved",
        eventId: i.eventId,
        venueId,
        details: { feature: i.featureKey, enabled: i.enabled, limit_override: limitOverride, limit: limitValue },
      },
    };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async unlockCouple(i: z.infer<typeof eventSchemas.id>, _ctx: AdminContext) {
    const venueId = await venueOfOrThrow(i.eventId);
    await check(db().rpc("admin_unlock_couple_login", { p_event_id: i.eventId }));
    return { data: null, audit: { action: "admin_couple_login_unlocked", eventId: i.eventId, venueId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async regenerateCouplePassword(i: z.infer<typeof eventSchemas.id>, _ctx: AdminContext) {
    const venueId = await venueOfOrThrow(i.eventId);
    const password = generateRandomPassword();
    // regenerate_event_password (0045) also deletes the event's couple_sessions
    // rows (SEC-009), so a couple session open at the time of a password reset
    // is ended immediately rather than staying valid until it expires.
    await regenerateEventPassword(i.eventId, password, db());
    // The password is returned once for the UI to show and never logged or
    // put in the audit row's `details` — only the fact that a reset happened.
    return { data: { password }, audit: { action: "admin_couple_password_regenerated", eventId: i.eventId, venueId } };
  },
};
