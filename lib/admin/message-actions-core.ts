import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Core logic for the contact-messages and maintenance-flag Server Actions
// (task 4.1). Kept apart from app/admin/(panel)/messages/actions.ts and
// app/admin/(panel)/system/actions.ts so it can be exercised directly from a
// DB test, without a Next.js request context — those actions.ts modules just
// wrap each of these in adminAction (guard → validate → run → audit), same
// convention as lib/admin/venue-actions-core.ts.

const db = () => createServiceRoleClient();
// revalidatePath throws outside a request (e.g. this module's own DB test
// calls messageActionCore directly, with no Next.js render/request under it).
const revalidate = (p: string) => {
  try {
    revalidatePath(p);
  } catch {
    /* outside a request (tests) */
  }
};
async function check(p: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await p;
  if (error) throw error;
}
const messageId = z.string().uuid();

export const messageSchemas = {
  setStatus: z.object({ id: messageId, status: z.enum(["new", "read", "answered"]) }),
  id: z.object({ id: messageId }),
  maintenance: z.object({ enabled: z.boolean() }),
};

export const messageActionCore = {
  // ctx (AdminContext) is required by every core function's shared shape —
  // adminAction always calls `run(input, ctx)` positionally (lib/admin/
  // actions.ts) — even where this particular action has no use for it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async setStatus(i: z.infer<typeof messageSchemas.setStatus>, _ctx: AdminContext) {
    await check(
      db()
        .from("contact_submissions")
        .update({ status: i.status, handled_at: i.status === "new" ? null : new Date().toISOString() })
        .eq("id", i.id)
    );
    revalidate("/admin/messages");
    // Never put the message text, name or email in the audit row
    // (constraints.md: no free text/PII in audit details) — id and status only.
    return { data: null, audit: { action: "admin_message_status", targetId: i.id, details: { status: i.status } } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(i: z.infer<typeof messageSchemas.id>, _ctx: AdminContext) {
    await check(db().from("contact_submissions").delete().eq("id", i.id));
    revalidate("/admin/messages");
    return { data: null, audit: { action: "admin_message_deleted", targetId: i.id } };
  },

  async setMaintenance(i: z.infer<typeof messageSchemas.maintenance>, ctx: AdminContext) {
    await check(
      db()
        .from("platform_settings")
        .update({ maintenance_mode: i.enabled, updated_at: new Date().toISOString(), updated_by: ctx.adminUserId })
        .eq("id", true)
    );
    // No local cache to invalidate here: proxy.ts runs as a separate
    // deployed function bundle with its own copy of lib/platform-settings.ts's
    // module state, so nothing this action does can reach it directly — the
    // database row is the only thing that crosses that boundary, and a live
    // proxy instance picks up this change within lib/platform-settings.ts's
    // own TTL (currently 30s). The System page's confirm copy says so.
    revalidate("/admin/system");
    return { data: null, audit: { action: i.enabled ? "admin_maintenance_on" : "admin_maintenance_off" } };
  },
};
