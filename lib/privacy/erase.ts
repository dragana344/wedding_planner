import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";
import { errorFields, log, logSecurityEvent } from "@/lib/log";

// DATA-005: erasure. The database part of each operation is one Postgres
// function (migration 0043), so it is all-or-nothing and writes its own audit
// row in the same transaction. Storage objects cannot be deleted from SQL:
// the function queues them, and they are removed here right away. If that
// fails the hourly cleanup cron retries, so the DB erasure still stands.

/** Placeholder written to events.couple_names by erase_event_personal_data. */
export const ERASED_COUPLE_NAMES = "Избришани податоци";

export type ErasureActor = { actorId?: string | null; requestId?: string | null };

async function drainStorage(context: string): Promise<void> {
  try {
    // Drain until empty: a venue with many photos can exceed one batch.
    for (let i = 0; i < 50; i++) {
      const { removed } = await drainStorageCleanupQueue();
      if (removed === 0) return;
    }
  } catch (err) {
    log("error", "privacy_storage_drain_failed", { context, ...errorFields(err) });
  }
}

/**
 * Removes the personal data of one event's couple and guests; keeps the event
 * row (date, rooms, status, finance) with the couple's names replaced by
 * {@link ERASED_COUPLE_NAMES}. Returns false when the event does not exist.
 */
export async function eraseEventPersonalData(eventId: string, actor: ErasureActor = {}): Promise<boolean> {
  const { data, error } = await createServiceRoleClient().rpc("erase_event_personal_data", {
    p_event_id: eventId,
    p_actor_id: actor.actorId ?? null,
    p_reason: "request",
    p_request_id: actor.requestId ?? null,
  });
  if (error) throw error;
  if (!data) return false;
  await drainStorage("event_erasure");
  return true;
}

/**
 * Deletes a venue account: the venue with everything it owns (cascade), every
 * stored photo under it, and the auth accounts of staff who belong to no
 * other venue. Returns false when the venue does not exist.
 *
 * TODO(owner decision, DATA-005): nothing is kept today. If anonymised
 * finance/reservation records must survive account closure (accounting
 * obligations), change delete_venue_account in a new migration.
 * See docs/production/RETENTION.md.
 */
export async function deleteVenueAccount(venueId: string, actor: ErasureActor = {}): Promise<boolean> {
  const client = createServiceRoleClient();
  const { data, error } = await client.rpc("delete_venue_account", {
    p_venue_id: venueId,
    p_actor_id: actor.actorId ?? null,
    p_request_id: actor.requestId ?? null,
  });
  if (error) throw error;
  if (!data) return false;

  const userIds = ((data as { user_ids?: string[] }).user_ids ?? []).filter(Boolean);
  for (const userId of userIds) {
    const { error: userError } = await client.auth.admin.deleteUser(userId);
    if (userError) log("error", "privacy_staff_user_delete_failed", { user_id: userId, ...errorFields(userError) });
  }
  logSecurityEvent("venue_account_deleted", { venue_id: venueId, user_id: actor.actorId ?? undefined });
  await drainStorage("venue_deletion");
  return true;
}
