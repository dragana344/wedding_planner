import { NextRequest, NextResponse } from "next/server";
import { drainStorageCleanupQueue, sweepStaleInvitationUploads } from "@/lib/storage-cleanup";
import { sweepStalePendingMedia } from "@/lib/media/storage";
import { runMediaRetention } from "@/lib/media/retention";
import { errorFields, log } from "@/lib/log";
import { safeEqual } from "@/lib/security/safe-equal";

// Vercel Cron (vercel.json) calls this with `Authorization: Bearer $CRON_SECRET`.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { removed } = await drainStorageCleanupQueue();
    const { removed: staleUploads } = await sweepStaleInvitationUploads();
    const { removed: staleMedia } = await sweepStalePendingMedia();
    // Guest album retention (Session 4): off until MEDIA_RETENTION_ENABLED=true; days per event from the package.
    const mediaRetention = await runMediaRetention();
    log("info", "storage_cleanup", { removed, stale_uploads: staleUploads, stale_media: staleMedia, media_retention: mediaRetention });
    return NextResponse.json({ removed, stale_uploads: staleUploads, stale_media: staleMedia, media_retention: mediaRetention });
  } catch (err) {
    log("error", "storage_cleanup_failed", errorFields(err));
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
