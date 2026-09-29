import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { errorFields, log } from "@/lib/log";

// Server-side entries in the append-only audit log (SEC-018, migration 0042).
// Staff actions done from the browser are recorded by database triggers
// instead. Never put names, contact details or free text in `details`.

export type AuditEntry = {
  action: string;
  actorType: "staff" | "couple" | "guest" | "system";
  actorId?: string | null;
  venueId?: string | null;
  eventId?: string | null;
  targetId?: string | null;
  requestId?: string | null;
  details?: Record<string, string | number | boolean | null>;
};

/** Writes one audit row. An audit failure is logged but never fails the user's action. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  const { error } = await createServiceRoleClient()
    .from("audit_log")
    .insert({
      action: entry.action,
      actor_type: entry.actorType,
      actor_id: entry.actorId ?? null,
      venue_id: entry.venueId ?? null,
      event_id: entry.eventId ?? null,
      target_id: entry.targetId ?? null,
      request_id: entry.requestId ?? null,
      details: entry.details ?? {},
    });
  if (error) log("error", "audit_write_failed", { action: entry.action, ...errorFields(error) });
}
