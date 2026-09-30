import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

const reminders = vi.hoisted(() => ({ runDueReminders: vi.fn(async () => [{ eventId: "e1", sent: 3, failed: 1 }]) }));
vi.mock("@/lib/couple/reminders", () => reminders);

import { GET } from "@/app/api/cron/reminders/route";
import vercelConfig from "@/vercel.json";

function req(auth?: string, extra: Record<string, string> = {}) {
  return new NextRequest("https://app.example.mk/api/cron/reminders", { headers: { ...(auth ? { authorization: auth } : {}), ...extra } });
}

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("reminders cron (A10)", () => {
  it("refuses callers without the cron secret, and when none is set", async () => {
    expect((await GET(req("Bearer x"))).status).toBe(401);
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer wrong"))).status).toBe(401);
    expect(reminders.runDueReminders).not.toHaveBeenCalled();
  });

  it("sends due reminders with links to the public site", async () => {
    process.env.CRON_SECRET = "s3cret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://kadesum.mk";
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ events: 1, sent: 3, failed: 1 });
    expect(reminders.runDueReminders).toHaveBeenCalledWith(expect.any(Date), "https://kadesum.mk");
  });

  it("without a configured site, links use the Host header, never x-forwarded-host", async () => {
    process.env.CRON_SECRET = "s3cret";
    // The function may see an internal URL; the public host is the Host header.
    await GET(
      new NextRequest("http://127.0.0.1:3000/api/cron/reminders", {
        headers: { authorization: "Bearer s3cret", host: "app.example.mk", "x-forwarded-host": "evil.example", "x-forwarded-proto": "https" },
      }),
    );
    expect(reminders.runDueReminders).toHaveBeenLastCalledWith(expect.any(Date), "https://app.example.mk");
  });

  it("is scheduled hourly in vercel.json", () => {
    expect(vercelConfig.crons).toContainEqual({ path: "/api/cron/reminders", schedule: expect.stringMatching(/^\d+ \* \* \* \*$/) });
  });
});
