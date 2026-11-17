import { NextResponse } from "next/server";
import { ALBUM_UPLOAD_ERROR, videoConfirmBody, withGuestAlbum } from "@/lib/media/guest-api";
import { confirmAlbumVideo } from "@/lib/media/videos";

// 0151: the uploaded video is checked (type, size, quota) and joins the album.
export const POST = withGuestAlbum(
  async ({ body, album }) => NextResponse.json(await confirmAlbumVideo(album.eventId, { path: body.path, uploaderName: body.uploader_name })),
  { feature: ["photo_album", "max_video_seconds"], body: videoConfirmBody, fallbackError: ALBUM_UPLOAD_ERROR },
);
