import { NextResponse } from "next/server";
import { z } from "zod";
import { withCoupleEvent } from "@/lib/api/handler";
import { idParams } from "@/lib/api/schemas";
import { deletePhoto, setPhotoHidden } from "@/lib/media/photos";

// C10: the couple moderates their guests' photos. Ids from another event
// match no row, so they change nothing.
export const PATCH = withCoupleEvent(
  async ({ eventId, params, body }) => {
    await setPhotoHidden(eventId, params.id, body.hidden);
    return NextResponse.json({ ok: true });
  },
  { feature: "photo_album", params: idParams, body: z.object({ hidden: z.boolean() }), fallbackError: "Не успеа промената на фотографијата." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, params }) => {
    await deletePhoto(eventId, params.id);
    return NextResponse.json({ ok: true });
  },
  { feature: "photo_album", params: idParams, fallbackError: "Не успеа бришењето на фотографијата." },
);
