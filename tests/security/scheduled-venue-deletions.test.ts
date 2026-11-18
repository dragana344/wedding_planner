import { describe, it, expect, vi, beforeEach } from "vitest";

// 0172: one venue failing to delete must not stop the others; it is logged
// and stays scheduled for the next run. 0178: the same for each event of the
// retention sweep, and for the Auth users a venue deletion left behind.
// (The real deletions are covered by tests/supabase/venue_scheduled_deletion
// and tests/supabase/erase_coverage.)

const mocks = vi.hoisted(() => ({
  due: [] as { id: string }[],
  query: { lte: [] as unknown[] },
  deleteScheduledVenue: vi.fn(),
  log: vi.fn(),
  rpc: vi.fn(),
  deleteUser: vi.fn(),
  drain: vi.fn(async () => ({ removed: 0 })),
  retries: [] as { user_id: string; attempts: number }[],
  retryDeletes: [] as string[],
  retryUpdates: [] as { id: string; patch: Record<string, unknown> }[],
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: mocks.rpc,
    auth: { admin: { deleteUser: mocks.deleteUser } },
    from: (table: string) => {
      if (table === "auth_user_deletion_retries") {
        return {
          select: () => ({ order: () => ({ limit: async () => ({ data: mocks.retries, error: null }) }) }),
          delete: () => ({ eq: async (_c: string, id: string) => (mocks.retryDeletes.push(id), { error: null }) }),
          update: (patch: Record<string, unknown>) => ({ eq: async (_c: string, id: string) => (mocks.retryUpdates.push({ id, patch }), { error: null }) }),
        };
      }
      return {
        select: () => ({
          not: () => ({
            lte: (...args: unknown[]) => {
              mocks.query.lte = args;
              return { limit: async () => ({ data: mocks.due, error: null }) };
            },
          }),
        }),
      };
    },
  }),
}));
vi.mock("@/lib/privacy/erase", () => ({ deleteScheduledVenue: mocks.deleteScheduledVenue }));
vi.mock("@/lib/storage-cleanup", () => ({ drainStorageCleanupQueue: mocks.drain }));
vi.mock("@/lib/log", () => ({ log: mocks.log, errorFields: (err: unknown) => ({ error: String(err) }) }));

import { runAuthUserDeletionRetries, runRetentionPurge, runScheduledVenueDeletions } from "@/lib/privacy/retention";

beforeEach(() => {
  mocks.deleteScheduledVenue.mockReset();
  mocks.log.mockReset();
  mocks.rpc.mockReset();
  mocks.deleteUser.mockReset();
  mocks.retryDeletes = [];
  mocks.retryUpdates = [];
});

describe("runScheduledVenueDeletions", () => {
  it("deletes every due venue, counting and logging a failure without stopping", async () => {
    mocks.due = [{ id: "v1" }, { id: "v2" }, { id: "v3" }, { id: "v4" }];
    mocks.deleteScheduledVenue.mockImplementation(async (id: string) => {
      if (id === "v2") throw new Error("auth down");
      return id !== "v4"; // v4: cancelled between the query and the delete
    });
    const now = new Date("2026-12-03T02:41:00Z");
    expect(await runScheduledVenueDeletions(now)).toEqual({ venues_deleted: 2, venues_failed: 1 });
    expect(mocks.deleteScheduledVenue.mock.calls.map((c) => c[0])).toEqual(["v1", "v2", "v3", "v4"]);
    expect(mocks.query.lte).toEqual(["deletion_scheduled_for", now.toISOString()]);
    expect(mocks.log).toHaveBeenCalledWith("error", "scheduled_venue_deletion_failed", expect.objectContaining({ venue_id: "v2" }));
  });

  it("does nothing when no deletion is due", async () => {
    mocks.due = [];
    expect(await runScheduledVenueDeletions()).toEqual({ venues_deleted: 0, venues_failed: 0 });
    expect(mocks.deleteScheduledVenue).not.toHaveBeenCalled();
  });
});

describe("runRetentionPurge (0178)", () => {
  it("erases each due event in its own call, logs a failing one and goes on, then purges messages and tickets", async () => {
    mocks.rpc.mockImplementation(async (fn: string, args?: { p_event_id?: string }) => {
      if (fn === "due_retention_event_ids") return { data: ["e1", "e2", "e3"], error: null };
      if (fn === "erase_event_personal_data") {
        if (args?.p_event_id === "e2") return { data: null, error: { message: "canceling statement due to statement timeout" } };
        return { data: true, error: null };
      }
      if (fn === "purge_old_contact_submissions") return { data: 4, error: null };
      if (fn === "purge_closed_support_tickets") return { data: 2, error: null };
      throw new Error(`unexpected ${fn}`);
    });
    mocks.drain.mockResolvedValueOnce({ removed: 3 }).mockResolvedValueOnce({ removed: 0 });

    expect(await runRetentionPurge()).toEqual({
      events_erased: 2, events_failed: 1, contact_submissions_deleted: 4, support_tickets_deleted: 2, files_removed: 3,
    });
    const erases = mocks.rpc.mock.calls.filter((c) => c[0] === "erase_event_personal_data").map((c) => c[1]);
    expect(erases).toEqual(["e1", "e2", "e3"].map((id) => ({ p_event_id: id, p_actor_id: null, p_reason: "retention" })));
    expect(mocks.log).toHaveBeenCalledWith("error", "retention_event_erase_failed", expect.objectContaining({ event_id: "e2" }));
    expect(mocks.rpc.mock.calls.map((c) => c[0]).slice(-2)).toEqual(["purge_old_contact_submissions", "purge_closed_support_tickets"]);
  });

  it("throws when the due list can't be read (the cron answers 500)", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("db down") });
    await expect(runRetentionPurge()).rejects.toThrow("db down");
  });
});

describe("runAuthUserDeletionRetries (0178)", () => {
  it("removes users that are now deleted or already gone, keeps and counts the ones that fail again", async () => {
    mocks.retries = [
      { user_id: "u1", attempts: 1 },
      { user_id: "u2", attempts: 2 },
      { user_id: "u3", attempts: 1 },
    ];
    mocks.deleteUser.mockImplementation(async (id: string) => {
      if (id === "u2") return { error: { status: 500, message: "auth down" } };
      if (id === "u3") return { error: { status: 404, message: "User not found" } };
      return { error: null };
    });
    expect(await runAuthUserDeletionRetries()).toEqual({ auth_users_deleted: 2, auth_users_failed: 1 });
    expect(mocks.retryDeletes).toEqual(["u1", "u3"]);
    expect(mocks.retryUpdates).toEqual([{ id: "u2", patch: expect.objectContaining({ attempts: 3, last_error: "auth down" }) }]);
    expect(mocks.log).toHaveBeenCalledWith("error", "auth_user_delete_retry_failed", expect.objectContaining({ user_id: "u2", attempts: 3 }));
  });
});
