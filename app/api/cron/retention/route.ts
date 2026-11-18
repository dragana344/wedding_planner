import { NextRequest, NextResponse } from "next/server";
import { runAuthUserDeletionRetries, runRetentionPurge, runScheduledVenueDeletions } from "@/lib/privacy/retention";
import { errorFields, log } from "@/lib/log";
import { safeEqual } from "@/lib/security/safe-equal";

// DATA-007: Vercel Cron (vercel.json, daily) calls this with
// `Authorization: Bearer $CRON_SECRET`. Erases events whose couple access has
// ended, one at a time, and old contact-form messages and closed support
// tickets (0170, 0176, 0178); deletes venues whose admin-scheduled deletion
// is due (0172); and retries staff Auth users a venue deletion could not
// remove (0178). The three run independently: one failing does not skip
// the others.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let failed = false;
  let purge = {};
  let venues = {};
  let authUsers = {};
  try {
    purge = await runRetentionPurge();
    log("info", "retention_purge", purge);
  } catch (err) {
    failed = true;
    log("error", "retention_purge_failed", errorFields(err));
  }
  try {
    venues = await runScheduledVenueDeletions();
    log("info", "scheduled_venue_deletions", venues);
  } catch (err) {
    failed = true;
    log("error", "scheduled_venue_deletions_failed", errorFields(err));
  }
  try {
    authUsers = await runAuthUserDeletionRetries();
    log("info", "auth_user_deletion_retries", authUsers);
  } catch (err) {
    failed = true;
    log("error", "auth_user_deletion_retries_failed", errorFields(err));
  }
  if (failed) return NextResponse.json({ error: "Retention purge failed" }, { status: 500 });
  return NextResponse.json({ ...purge, ...venues, ...authUsers });
}
