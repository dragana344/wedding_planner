// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

// Login review finding (2026-10-15, fixed 2026-11-02): a transient DB error
// while re-verifying a manager's elevation used to look identical to "not
// elevated" (the query's `error` was never even read), logging the manager
// out through no fault of their own. A real empty result must still return
// null; only a genuine query failure should throw.

const queryError = { message: "connection reset", code: "08006" };

function mockClient(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  };
}

describe("validateManagerElevation", () => {
  it("throws on a genuine DB error instead of treating it as 'not elevated'", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => mockClient({ data: null, error: queryError }) }));
    const { validateManagerElevation } = await import("@/lib/venue/manager-elevation");
    await expect(validateManagerElevation("sometoken", "v1")).rejects.toBe(queryError);
  });

  it("still returns null for a genuinely empty result (no row, expired, wrong venue)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => mockClient({ data: null, error: null }) }));
    const { validateManagerElevation } = await import("@/lib/venue/manager-elevation");
    await expect(validateManagerElevation("sometoken", "v1")).resolves.toBeNull();
  });
});
