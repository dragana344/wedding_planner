import { NextRequest, NextResponse } from "next/server";
import { drainStorageCleanupQueue } from "@/lib/storage-cleanup";
import { errorFields, log } from "@/lib/log";

// Vercel Cron (vercel.json) calls this with `Authorization: Bearer $CRON_SECRET`.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { removed } = await drainStorageCleanupQueue();
    log("info", "storage_cleanup", { removed });
    return NextResponse.json({ removed });
  } catch (err) {
    log("error", "storage_cleanup_failed", errorFields(err));
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
