import { NextRequest, NextResponse } from "next/server";
import { drainStorageCleanupQueue, sweepStaleInvitationUploads } from "@/lib/storage-cleanup";
import { sweepStalePendingMedia } from "@/lib/media/storage";
import { runMediaRetention } from "@/lib/media/retention";
import { errorFields, log } from "@/lib/log";
import { safeEqual } from "@/lib/security/safe-equal";

// Vercel Cron (vercel.json) calls this with `Authorization: Bearer $CRON_SECRET`.
export const dynamic = "force-dynamic";

const QUEUE_BATCH = 500;
const MAX_QUEUE_BATCHES = 20;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Each step runs on its own: with one run a day, a failure in the queue
  // must not also cost that day's upload sweeps and album retention.
  const failed: string[] = [];
  async function step<T>(name: string, run: () => Promise<T>): Promise<T | null> {
    try {
      return await run();
    } catch (err) {
      failed.push(name);
      log("error", "storage_cleanup_failed", { step: name, ...errorFields(err) });
      return null;
    }
  }

  const removed = await step("queue", async () => {
    // The queue is drained in batches; keep going while it is full so a big
    // deletion (a venue, an album) does not take days to clear.
    let total = 0;
    for (let batch = 0; batch < MAX_QUEUE_BATCHES; batch++) {
      const { removed: n } = await drainStorageCleanupQueue(QUEUE_BATCH);
      total += n;
      if (n < QUEUE_BATCH) break;
    }
    return total;
  });
  const staleUploads = await step("invitation_uploads", async () => (await sweepStaleInvitationUploads()).removed);
  const staleMedia = await step("pending_media", async () => (await sweepStalePendingMedia()).removed);
  // Guest album retention (Session 4): off until MEDIA_RETENTION_ENABLED=true; days per event from the package.
  const mediaRetention = await step("media_retention", () => runMediaRetention());

  const result = { removed, stale_uploads: staleUploads, stale_media: staleMedia, media_retention: mediaRetention };
  log("info", "storage_cleanup", { ...result, failed });
  if (failed.length > 0) return NextResponse.json({ error: "Cleanup failed", failed, ...result }, { status: 500 });
  return NextResponse.json(result);
}
