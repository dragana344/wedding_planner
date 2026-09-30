import "server-only";
import type { ZodType } from "zod";
import { requireAdmin, AdminAccessError, type AdminContext } from "@/lib/admin/guard";
import { recordAudit, type AuditEntry } from "@/lib/audit";
import { isUserFacingError } from "@/lib/api/handler";
import { errorFields, log } from "@/lib/log";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

export const ADMIN_ACTION_FAILED = "Акцијата не успеа.";

type Outcome<O> = { data: O; audit?: Omit<AuditEntry, "actorType" | "actorId" | "requestId"> };

/**
 * Every admin Server Action: guard → validate → run → audit (spec §5).
 * Intentional messages (plain Error, e.g. `throw new Error("...")`) reach the
 * UI unchanged, same convention as isUserFacingError in lib/api/handler.ts;
 * everything else is logged and answered with ADMIN_ACTION_FAILED so no
 * internal detail (table/column names, Postgres errors) leaks to the admin
 * dashboard's UI.
 */
export function adminAction<I, O>(
  schema: ZodType<I>,
  run: (input: I, ctx: AdminContext) => Promise<Outcome<O>>,
): (input: unknown) => Promise<ActionResult<O>> {
  return async (raw: unknown): Promise<ActionResult<O>> => {
    let ctx: AdminContext;
    try {
      ctx = await requireAdmin();
    } catch (err) {
      if (err instanceof AdminAccessError) return { ok: false, error: "Потребна е админ најава." };
      throw err;
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Неважечки податоци." };
    try {
      const { data, audit } = await run(parsed.data, ctx);
      if (audit) await recordAudit({ ...audit, actorType: "admin", actorId: ctx.adminUserId, requestId: ctx.requestId });
      return { ok: true, data };
    } catch (err) {
      if (isUserFacingError(err)) return { ok: false, error: err.message };
      log("error", "admin_action_failed", { request_id: ctx.requestId, ...errorFields(err) });
      return { ok: false, error: ADMIN_ACTION_FAILED };
    }
  };
}
