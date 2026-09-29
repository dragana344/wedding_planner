import "server-only";
import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { withPublic, type PublicHandlerContext, type RouteHandler } from "@/lib/api/handler";
import { getAlbumByToken, type PublicAlbum } from "@/lib/media/album";
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from "@/lib/media/limits";
import type { RateLimitRule } from "@/lib/security/rate-limit";

// Shared plumbing for the guests' album routes (/api/e/<token>/…). Kept here,
// not in lib/api/schemas.ts and RATE_LIMITS, so parallel sessions editing
// those files don't collide with this one.

export const ALBUM_NOT_FOUND_ERROR = "Албумот не постои.";
export const CONSENT_REQUIRED_ERROR = "Потребна е согласност за прикажување во албумот.";
export const ALBUM_UPLOAD_ERROR = "Не успеа прикачувањето. Обидете се повторно.";
export const GREETING_ERROR = "Не успеа испраќањето на честитката. Обидете се повторно.";

/** SEC-002 budgets for the public album: generous for a wedding, tight for abuse. */
export const ALBUM_RATE_LIMITS = {
  /** Photo and video uploads per guest (IP) per album. */
  upload: { bucket: "album-upload", limit: 120, windowSeconds: 3600, failClosed: false },
  /** All uploads to one album, whoever sends them. */
  uploadPerEvent: { bucket: "album-upload-event", limit: 3000, windowSeconds: 3600, failClosed: false },
  /** Greetings per guest (IP) per album. */
  greeting: { bucket: "greeting", limit: 10, windowSeconds: 3600, failClosed: false },
} satisfies Record<string, RateLimitRule>;

export const albumParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/) });
type AlbumParams = z.infer<typeof albumParams>;

export const photoUploadBody = z.object({ bytes: z.number().int().min(1).max(MAX_PHOTO_BYTES + 1) });
export const videoUploadBody = z.object({ bytes: z.number().int().min(1).max(MAX_VIDEO_BYTES + 1) });

export const photoConfirmBody = z.object({
  path: z.string().min(1).max(200),
  consent: z.literal(true, { error: CONSENT_REQUIRED_ERROR }),
  uploader_name: z.string().max(120).nullish(),
  width: z.number().int().min(1).max(20000).optional(),
  height: z.number().int().min(1).max(20000).optional(),
});

export const greetingBody = z.object({
  first_name: z.string().max(60),
  last_name: z.string().max(60),
  message: z.string().max(1000),
  video_path: z.string().min(1).max(200).nullish(),
});

/**
 * A public route under /api/e/<token>: the token must name an album (else
 * 404), then the handler gets the album alongside the usual context.
 */
export function withGuestAlbum<B>(
  handler: (ctx: PublicHandlerContext<AlbumParams, B> & { album: PublicAlbum }) => Promise<Response>,
  options: { body: ZodType<B>; fallbackError: string },
): RouteHandler<AlbumParams> {
  const notFound = () => NextResponse.json({ error: ALBUM_NOT_FOUND_ERROR }, { status: 404 });
  return withPublic<AlbumParams, B>(
    async (ctx) => {
      const album = await getAlbumByToken(ctx.params.token);
      if (!album) return notFound();
      return handler({ ...ctx, album });
    },
    { params: albumParams, invalidParamsError: ALBUM_NOT_FOUND_ERROR, ...options },
  );
}
