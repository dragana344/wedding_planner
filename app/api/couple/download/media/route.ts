import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { planKeepsakeMedia } from "@/lib/couple/keepsake/media";
import { attachmentDisposition } from "@/lib/couple/keepsake/names";
import { zipStream } from "@/lib/media/zip";
import { parseDownloadPin } from "@/lib/media/download-pin";

// Group A task 7: "Фотографии и видеа" — the invitation photo, the video
// greetings named by guest and the album, in folders, one ZIP part per
// request (parts as in the album download, ../../album/zip/route.ts), streamed
// from Storage without buffering. GET only, no `feature` (see ../book/route.ts).
// `before` (set by the download page) pins the file list, so the parts
// don't shift between requests (lib/media/download-pin.ts).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const INVALID_PART_ERROR = "Непостоечки дел од преземањето.";

export const GET = withCoupleEvent(
  async ({ request, eventId }) => {
    const searchParams = new URL(request.url).searchParams;
    const part = Number(searchParams.get("part") ?? "1");
    const before = parseDownloadPin(searchParams);
    if (before === null) return NextResponse.json({ error: INVALID_PART_ERROR }, { status: 400 });
    const parts = await planKeepsakeMedia(eventId, before);
    if (!Number.isInteger(part) || part < 1 || part > parts.length) {
      return NextResponse.json({ error: INVALID_PART_ERROR }, { status: 400 });
    }
    const entries = parts[part - 1].map((file) => ({ name: file.name, size: file.bytes, open: file.open }));
    const name = parts.length === 1 ? "Фотографии и видеа.zip" : `Фотографии и видеа — дел ${part} од ${parts.length}.zip`;
    return new Response(zipStream(entries), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": attachmentDisposition(name, `fotografii-del-${part}.zip`),
        "cache-control": "no-store",
      },
    });
  },
  { fallbackError: "Не успеа преземањето на фотографиите." },
);
