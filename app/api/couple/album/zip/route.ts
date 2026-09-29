import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { formatTime } from "@/lib/media/format";
import { listPhotoFiles, type PhotoFile } from "@/lib/media/photos";
import { openObjectStream } from "@/lib/media/storage";
import { planZipParts, zipStream } from "@/lib/media/zip";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// C3: "download all" — the visible photos as a stored (uncompressed) ZIP,
// streamed from Storage through this function without buffering. Large
// albums come in parts (planZipParts) so no archive needs ZIP64 and each
// download finishes well inside the function's time limit. The 4.5 MB limit
// applies to request bodies, not to streamed responses.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INVALID_PART_ERROR = "Непостоечки дел од албумот.";

function hhmm(iso: string): string {
  return formatTime(iso).replace(":", "");
}

function entryName(file: PhotoFile, index: number): string {
  const who = (file.uploaderName ?? "").normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "gostin";
  const extension = file.path.slice(file.path.lastIndexOf(".") + 1);
  return `${String(index + 1).padStart(3, "0")}-${who}-${hhmm(file.createdAt)}.${extension}`;
}

export const GET = withCoupleEvent(
  async ({ request, eventId }) => {
    const part = Number(new URL(request.url).searchParams.get("part") ?? "1");
    const parts = planZipParts(await listPhotoFiles(eventId));
    if (!Number.isInteger(part) || part < 1 || part > parts.length) {
      return NextResponse.json({ error: INVALID_PART_ERROR }, { status: 400 });
    }

    const { data: event } = await createServiceRoleClient().from("events").select("event_date").eq("id", eventId).single();
    const offset = parts.slice(0, part - 1).reduce((n, p) => n + p.length, 0);
    const entries = parts[part - 1].map((file, i) => ({
      name: entryName(file, offset + i),
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
  { fallbackError: "Не успеа преземањето на албумот." },
);
