// Browser-side media helpers for the guests' album page (C1, C7).
import { PHOTO_MAX_EDGE, fitWithin } from "@/lib/media/limits";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

export const PHOTO_PROCESS_ERROR = "Оваа фотографија не може да се обработи. Обидете се со JPEG или направете screenshot.";

/** A photo this browser cannot decode (e.g. HEIC outside Safari). */
export class PhotoProcessError extends Error {
  constructor() {
    super(PHOTO_PROCESS_ERROR);
    this.name = "PhotoProcessError";
  }
}

type Canvas2D = { drawImage(image: CanvasImageSource, x: number, y: number, w: number, h: number): void };

async function encodeJpeg(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d") as Canvas2D | null;
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Re-encodes a photo as a JPEG whose longer edge is at most 2560 px. Always
 * re-encoded, even when small: that also drops EXIF metadata such as the
 * phone's GPS position before the photo leaves the guest's device.
 */
export async function compressImage(file: File, maxEdge = PHOTO_MAX_EDGE): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new PhotoProcessError();
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const blob = await encodeJpeg(bitmap, width, height, 0.85);
    if (!blob) throw new PhotoProcessError();
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}

/** Length of a video in seconds, or NaN when the browser cannot tell. */
export function videoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value: number) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => done(video.duration);
    video.onerror = () => done(NaN);
    video.src = url;
  });
}

/**
 * Sends a file to Storage through a signed upload URL (from our API). A plain
 * PUT rather than the supabase-js client: guests have no session to manage,
 * and the page ships less JavaScript to their phones.
 */
export async function putSignedUpload(bucket: string, path: string, token: string, blob: Blob): Promise<void> {
  const url = `${supabaseUrl()}/storage/v1/object/upload/sign/${bucket}/${path}?token=${encodeURIComponent(token)}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { apikey: supabaseAnonKey(), "content-type": blob.type || "application/octet-stream", "x-upsert": "false" },
    body: blob,
  });
  if (!response.ok) throw new Error("upload failed");
}
