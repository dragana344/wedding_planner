import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";
import { deleteScheduledVenue } from "@/lib/privacy/erase";
import { errorFields, log } from "@/lib/log";

// DATA-007: the scheduled retention sweep (migration 0170; closed support
// tickets since 0176). Since 0178 each due event is erased in its own call
// (erase_event_personal_data), so one slow or failing event never holds up
// the others or runs into the statement timeout: it is logged and left for
// the next day's run. Then the old contact-form messages and the closed
// support tickets go, each in its own call. The photo files the erasures
// queue are removed here right away (the storage-cleanup cron retries
// whatever is left).

export type RetentionResult = {
  events_erased: number;
  events_failed: number;
  contact_submissions_deleted: number;
  support_tickets_deleted: number;
  files_removed: number;
};

export async function runRetentionPurge(): Promise<RetentionResult> {
  const client = createServiceRoleClient();
  const { data: due, error } = await client.rpc("due_retention_event_ids");
  if (error) throw error;
  let eventsErased = 0;
  let eventsFailed = 0;
  for (const eventId of (due ?? []) as string[]) {
    try {
      const { error: eraseError } = await client.rpc("erase_event_personal_data", { p_event_id: eventId, p_actor_id: null, p_reason: "retention" });
      if (eraseError) throw eraseError;
      eventsErased++;
    } catch (err) {
      eventsFailed++;
      log("error", "retention_event_erase_failed", { event_id: eventId, ...errorFields(err) });
    }
  }

  const contacts = await client.rpc("purge_old_contact_submissions");
  if (contacts.error) throw contacts.error;
  const tickets = await client.rpc("purge_closed_support_tickets");
  if (tickets.error) throw tickets.error;

  let filesRemoved = 0;
  for (let i = 0; i < 20; i++) {
    const { removed } = await drainStorageCleanupQueue();
    filesRemoved += removed;
    if (removed === 0) break;
  }
  return {
    events_erased: eventsErased,
    events_failed: eventsFailed,
    contact_submissions_deleted: Number(contacts.data ?? 0),
    support_tickets_deleted: Number(tickets.data ?? 0),
    files_removed: filesRemoved,
  };
}

export type VenueDeletionResult = { venues_deleted: number; venues_failed: number };

/**
 * Deletes every venue whose admin-scheduled deletion (0172) is due, one at a
 * time: a venue that fails is logged and left scheduled, so the next day's
 * run tries it again, and the others still go.
 */
export async function runScheduledVenueDeletions(now: Date = new Date()): Promise<VenueDeletionResult> {
  const { data, error } = await createServiceRoleClient()
    .from("venues")
    .select("id")
    .not("deletion_scheduled_for", "is", null)
    .lte("deletion_scheduled_for", now.toISOString())
    .limit(500);
  if (error) throw error;
  const result: VenueDeletionResult = { venues_deleted: 0, venues_failed: 0 };
  for (const { id } of data ?? []) {
    try {
      if (await deleteScheduledVenue(id)) result.venues_deleted++;
    } catch (err) {
      result.venues_failed++;
      log("error", "scheduled_venue_deletion_failed", { venue_id: id, ...errorFields(err) });
    }
  }
  return result;
}

export type AuthUserRetryResult = { auth_users_deleted: number; auth_users_failed: number };

/**
 * Retries the staff Auth users a venue deletion could not remove (0178,
 * recorded by lib/privacy/erase.ts). A user that is gone — deleted now, or
 * already missing — leaves the queue; one that fails again stays, with the
 * attempt counted and logged.
 */
export async function runAuthUserDeletionRetries(): Promise<AuthUserRetryResult> {
  const client = createServiceRoleClient();
  const { data, error } = await client.from("auth_user_deletion_retries").select("user_id, attempts").order("created_at").limit(500);
  if (error) throw error;
  const result: AuthUserRetryResult = { auth_users_deleted: 0, auth_users_failed: 0 };
  for (const row of (data ?? []) as { user_id: string; attempts: number }[]) {
    const { error: deleteError } = await client.auth.admin.deleteUser(row.user_id);
    if (!deleteError || deleteError.status === 404) {
      await client.from("auth_user_deletion_retries").delete().eq("user_id", row.user_id);
      result.auth_users_deleted++;
      continue;
    }
    result.auth_users_failed++;
    log("error", "auth_user_delete_retry_failed", { user_id: row.user_id, attempts: row.attempts + 1, ...errorFields(deleteError) });
    await client
      .from("auth_user_deletion_retries")
      .update({ attempts: row.attempts + 1, last_error: deleteError.message.slice(0, 500), last_attempt_at: new Date().toISOString() })
      .eq("user_id", row.user_id);
  }
  return result;
}
