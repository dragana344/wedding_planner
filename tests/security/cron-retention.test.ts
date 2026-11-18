import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

const retention = vi.hoisted(() => ({
  runRetentionPurge: vi.fn(async () => ({ events_erased: 2, events_failed: 0, contact_submissions_deleted: 1, support_tickets_deleted: 0, files_removed: 5 })),
  runScheduledVenueDeletions: vi.fn(async () => ({ venues_deleted: 1, venues_failed: 0 })),
  runAuthUserDeletionRetries: vi.fn(async () => ({ auth_users_deleted: 1, auth_users_failed: 0 })),
}));
vi.mock("@/lib/privacy/retention", () => retention);

import { GET } from "@/app/api/cron/retention/route";
import vercelConfig from "@/vercel.json";

const req = (auth?: string) => new NextRequest("https://app.example.mk/api/cron/retention", { headers: auth ? { authorization: auth } : {} });

afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("retention cron (DATA-007, 0170)", () => {
  it("refuses callers without the cron secret, and when none is set", async () => {
    expect((await GET(req("Bearer x"))).status).toBe(401);
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(retention.runRetentionPurge).not.toHaveBeenCalled();
    expect(retention.runScheduledVenueDeletions).not.toHaveBeenCalled();
  });

  it("runs the purge, the scheduled venue deletions (0172) and the Auth-user retries (0178) and returns their counts", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      events_erased: 2, events_failed: 0, contact_submissions_deleted: 1, support_tickets_deleted: 0, files_removed: 5,
      venues_deleted: 1, venues_failed: 0, auth_users_deleted: 1, auth_users_failed: 0,
    });
  });

  it("answers 500 when the purge fails, but still runs the venue deletions", async () => {
    process.env.CRON_SECRET = "s3cret";
    retention.runRetentionPurge.mockRejectedValueOnce(new Error("boom"));
    retention.runScheduledVenueDeletions.mockClear();
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Retention purge failed" });
    expect(retention.runScheduledVenueDeletions).toHaveBeenCalledTimes(1);
  });

  it("answers 500 when the venue deletions fail, after the purge has run", async () => {
    process.env.CRON_SECRET = "s3cret";
    retention.runRetentionPurge.mockClear();
    retention.runScheduledVenueDeletions.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(retention.runRetentionPurge).toHaveBeenCalledTimes(1);
  });

  it("answers 500 when the Auth-user retries fail, after the other two have run", async () => {
    process.env.CRON_SECRET = "s3cret";
    retention.runRetentionPurge.mockClear();
    retention.runScheduledVenueDeletions.mockClear();
    retention.runAuthUserDeletionRetries.mockRejectedValueOnce(new Error("boom"));
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(retention.runRetentionPurge).toHaveBeenCalledTimes(1);
    expect(retention.runScheduledVenueDeletions).toHaveBeenCalledTimes(1);
  });

  it("is scheduled daily in vercel.json", () => {
    expect(vercelConfig.crons).toContainEqual({ path: "/api/cron/retention", schedule: expect.stringMatching(/^\d+ \d+ \* \* \*$/) });
  });
});
