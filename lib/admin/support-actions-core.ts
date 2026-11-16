import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Core logic for the inbox's venue/couple ticket Server Actions (0089,
// 0150), kept apart from app/admin/(panel)/messages/actions.ts so it can be
// exercised directly from a DB test — same convention as
// lib/admin/message-actions-core.ts.

const db = () => createServiceRoleClient();
// The layout, not just the page: the sidebar's inbox count changes too.
const revalidate = () => {
  try {
    revalidatePath("/admin", "layout");
  } catch {
    /* outside a request (tests) */
  }
};
async function check(p: PromiseLike<{ error: unknown }>): Promise<void> {
  const { error } = await p;
  if (error) throw error;
}

const status = z.enum(["new", "in_progress", "done"]);

export const supportTicketSchemas = {
  setStatus: z.object({ id: z.string().uuid(), status }),
  reply: z.object({
    id: z.string().uuid(),
    body: z.string().trim().min(1, "Внесете порака.").max(5000, "Пораката е предолга."),
  }),
};

const statusFields = (s: z.infer<typeof status>) => ({ status: s, resolved_at: s === "done" ? new Date().toISOString() : null });

export const supportTicketActionCore = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async setStatus(i: z.infer<typeof supportTicketSchemas.setStatus>, _ctx: AdminContext) {
    // Taking a ticket up or closing it answers the sender's last message as
    // far as the queue is concerned; reopening it puts it back.
    await check(db().from("support_tickets").update({ ...statusFields(i.status), awaiting_admin: i.status === "new" }).eq("id", i.id));
    revalidate();
    // Never put the ticket's name, problem or description in the audit row
    // (constraints.md: no free text/PII in audit details) — id and status only.
    return { data: null, audit: { action: "admin_support_ticket_status", targetId: i.id, details: { status: i.status } } };
  },

  async reply(i: z.infer<typeof supportTicketSchemas.reply>, ctx: AdminContext) {
    const { data: current, error } = await db().from("support_tickets").select("status").eq("id", i.id).maybeSingle();
    if (error) throw error;
    if (!current) throw new Error("Барањето не е пронајдено.");
    const { data: message, error: insertError } = await db()
      .from("support_ticket_messages")
      .insert({ ticket_id: i.id, author: "admin", admin_user_id: ctx.adminUserId, body: i.body })
      .select("created_at")
      .single();
    if (insertError) throw insertError;
    // A reply on a ticket nobody had started yet moves it to "in progress".
    const next = current.status === "new" ? "in_progress" : current.status;
    await check(
      db()
        .from("support_tickets")
        .update({ ...(next !== current.status ? statusFields(next) : {}), awaiting_admin: false, requester_unread: true, last_message_at: message.created_at })
        .eq("id", i.id)
    );
    revalidate();
    return { data: null, audit: { action: "admin_support_ticket_reply", targetId: i.id, details: { status: next } } };
  },
};
