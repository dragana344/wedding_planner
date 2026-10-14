import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Core logic for the support-tickets Server Action, kept apart from
// app/admin/(panel)/support/actions.ts so it can be exercised directly from
// a DB test — same convention as lib/admin/message-actions-core.ts.

const db = () => createServiceRoleClient();
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

export const supportTicketSchemas = {
  setStatus: z.object({
    id: z.string().uuid(),
    status: z.enum(["pending", "done"]),
    adminComment: z.string().trim().max(2000).optional(),
  }),
};

export const supportTicketActionCore = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async setStatus(i: z.infer<typeof supportTicketSchemas.setStatus>, _ctx: AdminContext) {
    await check(
      db()
        .from("support_tickets")
        .update({
          status: i.status,
          admin_comment: i.adminComment?.length ? i.adminComment : null,
          resolved_at: i.status === "done" ? new Date().toISOString() : null,
        })
        .eq("id", i.id)
    );
    revalidate("/admin/support");
    // Never put the ticket's name, problem or description in the audit row
    // (constraints.md: no free text/PII in audit details) — id and status only.
    return { data: null, audit: { action: "admin_support_ticket_status", targetId: i.id, details: { status: i.status } } };
  },
};
