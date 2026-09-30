// @vitest-environment node
//
// adminAction (lib/admin/actions.ts): guard → validate → run → audit, and
// which errors reach the admin UI verbatim versus the generic failure.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => {
  class AdminAccessError extends Error {
    constructor() {
      super("Admin access required.");
    }
  }
  return {
    AdminAccessError,
    requireAdmin: vi.fn(),
    recordAudit: vi.fn(async () => {}),
  };
});
vi.mock("@/lib/admin/guard", () => ({ requireAdmin: mocks.requireAdmin, AdminAccessError: mocks.AdminAccessError }));
vi.mock("@/lib/audit", () => ({ recordAudit: mocks.recordAudit }));

import { adminAction, ADMIN_ACTION_FAILED } from "@/lib/admin/actions";

const schema = z.object({ venueId: z.string().uuid("Неважечки локал.") });
const VENUE = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ adminUserId: "admin-1", requestId: "req-1" });
});

describe("adminAction", () => {
  it("refuses a caller who is not a signed-in admin without running anything", async () => {
    mocks.requireAdmin.mockRejectedValue(new mocks.AdminAccessError());
    const run = vi.fn();
    expect(await adminAction(schema, run)({ venueId: VENUE })).toEqual({ ok: false, error: "Потребна е админ најава." });
    expect(run).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("answers invalid input with the schema's message", async () => {
    const run = vi.fn();
    expect(await adminAction(schema, run)({ venueId: "nope" })).toEqual({ ok: false, error: "Неважечки локал." });
    expect(run).not.toHaveBeenCalled();
  });

  it("runs, then audits as the admin with the request id", async () => {
    const run = vi.fn(async (input: { venueId: string }) => ({
      data: { id: input.venueId },
      audit: { action: "admin_venue_blocked" as const, venueId: input.venueId, details: { reason_length: 3 } },
    }));
    const result = await adminAction(schema, run)({ venueId: VENUE });
    expect(result).toEqual({ ok: true, data: { id: VENUE } });
    expect(run).toHaveBeenCalledWith({ venueId: VENUE }, { adminUserId: "admin-1", requestId: "req-1" });
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      action: "admin_venue_blocked",
      venueId: VENUE,
      details: { reason_length: 3 },
      actorType: "admin",
      actorId: "admin-1",
      requestId: "req-1",
    });
  });

  it("hides a PostgREST/Postgres error behind the generic failure", async () => {
    const pgError = Object.assign(new Error('relation "venues" violates check constraint'), { code: "23514" });
    const result = await adminAction(schema, async () => {
      throw pgError;
    })({ venueId: VENUE });
    expect(result).toEqual({ ok: false, error: ADMIN_ACTION_FAILED });
    expect(ADMIN_ACTION_FAILED).toBe("Акцијата не успеа.");
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("hides a plain PostgREST error object (not an Error) too", async () => {
    const result = await adminAction(schema, async () => {
      throw { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" };
    })({ venueId: VENUE });
    expect(result).toEqual({ ok: false, error: "Акцијата не успеа." });
  });

  it("passes an intentional plain Error message through", async () => {
    const result = await adminAction(schema, async () => {
      throw new Error("x");
    })({ venueId: VENUE });
    expect(result).toEqual({ ok: false, error: "x" });
  });
});
