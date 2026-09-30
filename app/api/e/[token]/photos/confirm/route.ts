import { NextResponse } from "next/server";
import { ALBUM_UPLOAD_ERROR, photoConfirmBody, withGuestAlbum } from "@/lib/media/guest-api";
import { confirmPhotoUpload } from "@/lib/media/photos";

// C1 step 2: check the uploaded bytes, size and quota, then add the photo to
// the album. The guest has ticked the consent box (the schema requires it).
export const POST = withGuestAlbum(
  async ({ body, album }) =>
    NextResponse.json(
      await confirmPhotoUpload(album.eventId, {
        path: body.path,
        uploaderName: body.uploader_name,
        width: body.width,
        height: body.height,
      }),
    ),
  { feature: "photo_album", body: photoConfirmBody, fallbackError: ALBUM_UPLOAD_ERROR },
);
