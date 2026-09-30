import { NextRequest, NextResponse } from "next/server";
import { runDueReminders } from "@/lib/couple/reminders";
import { errorFields, log } from "@/lib/log";
import { safeEqual } from "@/lib/security/safe-equal";
import { resolveOrigin } from "@/lib/origin";

// A10: Vercel Cron (vercel.json, hourly) calls this with
// `Authorization: Bearer $CRON_SECRET` to send the guests' reminder emails.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const origin = resolveOrigin((name) => request.headers.get(name), process.env.NEXT_PUBLIC_SITE_URL);
    const results = await runDueReminders(new Date(), origin);
    const summary = {
      events: results.length,
      sent: results.reduce((n, r) => n + r.sent, 0),
      failed: results.reduce((n, r) => n + r.failed, 0),
    };
    log("info", "reminders_sent", summary);
    return NextResponse.json(summary);
  } catch (err) {
    log("error", "reminders_failed", errorFields(err));
    return NextResponse.json({ error: "Reminders failed" }, { status: 500 });
  }
}
