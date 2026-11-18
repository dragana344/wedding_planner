import { describe, it, expect, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { venueActionCore, VENUE_DELETION_DELAY_DAYS } from "@/lib/admin/venue-actions-core";
import { runAuthUserDeletionRetries, runScheduledVenueDeletions } from "@/lib/privacy/retention";

// 0172: the admin's "delete venue" schedules the deletion 15 days later; the
// daily retention cron deletes due venues (and their staff Auth users).

vi.setConfig({ testTimeout: 30_000 });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad01", requestId: "req-sched-del" };
const stamp = Date.now();
const venuesToClean: string[] = [];
const usersToClean: string[] = [];

async function newVenue(tag: string): Promise<{ id: string; name: string }> {
  const name = `Sched Delete ${tag} ${stamp}`;
  const { data, error } = await admin.from("venues").insert({ name }).select("id").single();
  if (error) throw error;
  venuesToClean.push(data.id);
  return { id: data.id, name };
}

async function newStaff(venueId: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email: `sched-${randomUUID()}@test.local`, password: "test-password-123", email_confirm: true });
  if (error) throw error;
  usersToClean.push(data.user.id);
  const { error: staffError } = await admin.from("venue_staff").insert({ user_id: data.user.id, venue_id: venueId });
  if (staffError) throw staffError;
  return data.user.id;
}

const scheduledFor = async (venueId: string) =>
  (await admin.from("venues").select("deletion_scheduled_for, deletion_scheduled_by").eq("id", venueId).maybeSingle()).data;

afterAll(async () => {
  if (venuesToClean.length) await admin.from("venues").delete().in("id", venuesToClean);
  for (const id of usersToClean) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

describe("admin: scheduled venue deletion (0172)", () => {
  it("schedules 15 days ahead behind the typed name, audits it, and refuses a second schedule", async () => {
    const v = await newVenue("schedule");
    await expect(venueActionCore.scheduleRemoval({ venueId: v.id, confirmName: "погрешно" }, ctx)).rejects.toThrow("Внесете го точното име на локалот.");
    expect((await scheduledFor(v.id))!.deletion_scheduled_for).toBeNull();

    const before = Date.now();
    const r = await venueActionCore.scheduleRemoval({ venueId: v.id, confirmName: v.name }, ctx);
    const row = (await scheduledFor(v.id))!;
    expect(row.deletion_scheduled_by).toBe(ctx.adminUserId);
    const delayMs = new Date(row.deletion_scheduled_for!).getTime() - before;
    expect(VENUE_DELETION_DELAY_DAYS).toBe(15);
    expect(Math.abs(delayMs - 15 * 86_400_000)).toBeLessThan(60_000);
    expect(r.audit).toMatchObject({ action: "venue_deletion_scheduled", venueId: v.id, details: { scheduled_for: r.data.scheduledFor } });
    expect(new Date(r.data.scheduledFor).getTime()).toBe(new Date(row.deletion_scheduled_for!).getTime());

    await expect(venueActionCore.scheduleRemoval({ venueId: v.id, confirmName: v.name }, ctx)).rejects.toThrow("Бришењето е веќе закажано.");
    // The venue itself is untouched until the date.
    expect((await admin.from("venues").select("id").eq("id", v.id)).data).toHaveLength(1);
  });

  it("cancels a scheduled deletion (audited) and refuses to cancel when nothing is scheduled", async () => {
    const v = await newVenue("cancel");
    await expect(venueActionCore.cancelRemoval({ venueId: v.id }, ctx)).rejects.toThrow("Бришењето не е закажано.");
    const { data } = await venueActionCore.scheduleRemoval({ venueId: v.id, confirmName: v.name }, ctx);
    const r = await venueActionCore.cancelRemoval({ venueId: v.id }, ctx);
    expect(r.audit).toMatchObject({ action: "venue_deletion_cancelled", venueId: v.id });
    expect(new Date((r.audit.details as { scheduled_for: string }).scheduled_for).getTime()).toBe(new Date(data.scheduledFor).getTime());
    expect(await scheduledFor(v.id)).toEqual({ deletion_scheduled_for: null, deletion_scheduled_by: null });
  });

  it("deletes immediately only once a deletion is scheduled, and only with the typed name", async () => {
    const v = await newVenue("now");
    await expect(venueActionCore.remove({ venueId: v.id, confirmName: v.name }, ctx)).rejects.toThrow("Прво закажете го бришењето.");
    await venueActionCore.scheduleRemoval({ venueId: v.id, confirmName: v.name }, ctx);
    await expect(venueActionCore.remove({ venueId: v.id, confirmName: "погрешно" }, ctx)).rejects.toThrow("Внесете го точното име на локалот.");
    const r = await venueActionCore.remove({ venueId: v.id, confirmName: v.name }, ctx);
    expect(r.audit).toMatchObject({ action: "admin_venue_deleted", details: { venue_id: v.id, immediate: true } });
    expect((await admin.from("venues").select("id").eq("id", v.id)).data).toEqual([]);
  });

  it("refuses every deletion action on a venue that doesn't exist", async () => {
    const missingId = "22222222-3333-4000-8000-555555555555";
    await expect(venueActionCore.scheduleRemoval({ venueId: missingId, confirmName: "x" }, ctx)).rejects.toThrow("Локалот не постои.");
    await expect(venueActionCore.cancelRemoval({ venueId: missingId }, ctx)).rejects.toThrow("Локалот не постои.");
    await expect(venueActionCore.remove({ venueId: missingId, confirmName: "x" }, ctx)).rejects.toThrow("Локалот не постои.");
  });
});

describe("cron: runScheduledVenueDeletions (0172)", () => {
  it("deletes due venues with their staff Auth users and leaves not-yet-due and cancelled ones", async () => {
    const due = await newVenue("due");
    const dueStaff = await newStaff(due.id);
    const { data: event } = await admin.from("events").insert({ venue_id: due.id, couple_names: `Couple ${stamp}`, event_date: "2027-06-01" }).select("id").single();
    const future = await newVenue("future");
    const futureStaff = await newStaff(future.id);
    const cancelled = await newVenue("cancelled");

    const past = new Date(Date.now() - 60_000).toISOString();
    await admin.from("venues").update({ deletion_scheduled_for: past, deletion_scheduled_by: ctx.adminUserId }).eq("id", due.id);
    await admin.from("venues").update({ deletion_scheduled_for: new Date(Date.now() + 86_400_000).toISOString() }).eq("id", future.id);
    await venueActionCore.scheduleRemoval({ venueId: cancelled.id, confirmName: cancelled.name }, ctx);
    await venueActionCore.cancelRemoval({ venueId: cancelled.id }, ctx);

    const result = await runScheduledVenueDeletions();
    expect(result.venues_deleted).toBeGreaterThanOrEqual(1);
    expect(result.venues_failed).toBe(0);

    expect((await admin.from("venues").select("id").eq("id", due.id)).data).toEqual([]);
    expect((await admin.from("events").select("id").eq("id", event!.id)).data).toEqual([]);
    expect((await admin.auth.admin.getUserById(dueStaff)).data.user).toBeNull();
    const { data: audit } = await admin.from("audit_log").select("actor_type, actor_id, details").eq("venue_id", due.id).eq("action", "venue_account_deleted");
    expect(audit).toEqual([{ actor_type: "system", actor_id: null, details: { events: 1, staff_accounts: 1 } }]);

    expect((await admin.from("venues").select("id").in("id", [future.id, cancelled.id])).data).toHaveLength(2);
    expect((await admin.auth.admin.getUserById(futureStaff)).data.user).not.toBeNull();
  });

  it("delete_scheduled_venue refuses a venue whose deletion is not due (e.g. cancelled in the meantime)", async () => {
    const v = await newVenue("race");
    const { data, error } = await admin.rpc("delete_scheduled_venue", { p_venue_id: v.id });
    expect(error).toBeNull();
    expect(data).toBeNull();
    expect((await admin.from("venues").select("id").eq("id", v.id)).data).toHaveLength(1);
  });

  it("delete_scheduled_venue is not callable by a signed-in staff user", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { error } = await anon.rpc("delete_scheduled_venue", { p_venue_id: randomUUID() });
    expect(error).not.toBeNull();
  });
});

describe("cron: runAuthUserDeletionRetries (0178)", () => {
  it("deletes queued Auth users and clears their rows, also for a user that is already gone", async () => {
    const { data, error } = await admin.auth.admin.createUser({ email: `retry-${randomUUID()}@test.local`, password: "test-password-123", email_confirm: true });
    if (error) throw error;
    usersToClean.push(data.user.id);
    const gone = randomUUID();
    await admin.from("auth_user_deletion_retries").insert([
      { user_id: data.user.id, venue_id: randomUUID(), last_error: "timeout" },
      { user_id: gone, venue_id: null, last_error: "timeout" },
    ]);

    const result = await runAuthUserDeletionRetries();
    expect(result.auth_users_deleted).toBeGreaterThanOrEqual(2);
    expect((await admin.auth.admin.getUserById(data.user.id)).data.user).toBeNull();
    expect((await admin.from("auth_user_deletion_retries").select("user_id").in("user_id", [data.user.id, gone])).data).toEqual([]);
  });

  it("the queue is not readable without the service role", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    expect((await anon.from("auth_user_deletion_retries").select("user_id")).error).not.toBeNull();
  });
});
