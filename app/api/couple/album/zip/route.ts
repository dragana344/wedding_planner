import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { albumEntryName } from "@/lib/couple/keepsake/names";
import { listPhotoFiles } from "@/lib/media/photos";
import { openObjectStream } from "@/lib/media/storage";
import { planZipParts, zipStream } from "@/lib/media/zip";
import { parseDownloadPin } from "@/lib/media/download-pin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// C3: "download all" — the visible photos as a stored (uncompressed) ZIP,
// streamed from Storage through this function without buffering. Albums come
// in parts of ~200 MB (planZipParts) so a part finishes inside maxDuration on
// an ordinary connection. The 4.5 MB limit applies to request bodies, not to
// streamed responses. `before` (set by the album page) pins the photo list,
// so the parts don't shift between requests (lib/media/download-pin.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INVALID_PART_ERROR = "Непостоечки дел од албумот.";

export const GET = withCoupleEvent(
  async ({ request, eventId }) => {
    const searchParams = new URL(request.url).searchParams;
    const part = Number(searchParams.get("part") ?? "1");
    const before = parseDownloadPin(searchParams);
    if (before === null) return NextResponse.json({ error: INVALID_PART_ERROR }, { status: 400 });
    const parts = planZipParts(await listPhotoFiles(eventId, before));
    if (!Number.isInteger(part) || part < 1 || part > parts.length) {
      return NextResponse.json({ error: INVALID_PART_ERROR }, { status: 400 });
    }

    const { data: event } = await createServiceRoleClient().from("events").select("event_date").eq("id", eventId).single();
    const offset = parts.slice(0, part - 1).reduce((n, p) => n + p.length, 0);
    const entries = parts[part - 1].map((file, i) => ({
      name: albumEntryName(file, offset + i),
      size: file.bytes,
      open: () => openObjectStream(file.path),
    }));

    return new Response(zipStream(entries), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="album-${event?.event_date ?? "photos"}-del-${part}.zip"`,
        "cache-control": "no-store",
      },
    });
  },
  // No `feature`: downloading what the couple already has keeps working
  // after a downgrade (group A task 2) and in the read-only period.
  { fallbackError: "Не успеа преземањето на албумот." },
);
