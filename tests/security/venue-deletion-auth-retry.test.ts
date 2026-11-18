import { describe, it, expect, vi, beforeEach } from "vitest";

// 0178: when a venue is deleted but one of its staff Auth users can't be,
// the user id is queued for the daily cron's retry and logged. A user that
// is already gone (404) is not queued.

const mocks = vi.hoisted(() => ({
  deleteUser: vi.fn(),
  upserts: [] as unknown[],
  log: vi.fn(),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    rpc: async () => ({ data: { user_ids: ["u1", "u2", "u3"] }, error: null }),
    auth: { admin: { deleteUser: mocks.deleteUser } },
    from: () => ({ upsert: async (row: unknown) => (mocks.upserts.push(row), { error: null }) }),
  }),
}));
vi.mock("@/lib/storage-cleanup", () => ({ drainStorageCleanupQueue: vi.fn(async () => ({ removed: 0 })) }));
vi.mock("@/lib/log", () => ({ log: mocks.log, logSecurityEvent: vi.fn(), errorFields: (err: unknown) => ({ error: String(err) }) }));

import { deleteScheduledVenue } from "@/lib/privacy/erase";

beforeEach(() => {
  mocks.upserts = [];
  mocks.log.mockReset();
});

describe("venue deletion: Auth users that fail to delete (0178)", () => {
  it("queues the failed user for retry and logs it; skips users that are deleted or already gone", async () => {
    mocks.deleteUser.mockImplementation(async (id: string) => {
      if (id === "u2") return { error: { status: 500, message: "auth down" } };
      if (id === "u3") return { error: { status: 404, message: "User not found" } };
      return { error: null };
    });
    expect(await deleteScheduledVenue("v1")).toBe(true);
    expect(mocks.upserts).toEqual([{ user_id: "u2", venue_id: "v1", last_error: "auth down" }]);
    expect(mocks.log).toHaveBeenCalledWith("error", "privacy_staff_user_delete_failed", expect.objectContaining({ user_id: "u2", venue_id: "v1" }));
  });
});
