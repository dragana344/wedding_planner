import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { listPhotos } from "@/lib/media/photos";

const PAGE = 60;

// C3: older album photos for "Прикажи уште" (hidden ones included; the couple moderates).
export const GET = withCoupleEvent(
  async ({ request, eventId }) => {
    const before = new URL(request.url).searchParams.get("before");
    const valid = before && !Number.isNaN(Date.parse(before)) ? before : undefined;
    const photos = await listPhotos(eventId, { includeHidden: true, limit: PAGE + 1, before: valid });
    return NextResponse.json({ photos: photos.slice(0, PAGE), hasMore: photos.length > PAGE });
  },
  { fallbackError: "Не успеа вчитувањето на фотографиите." },
);
