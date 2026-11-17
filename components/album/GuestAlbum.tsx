"use client";

import { useEffect, useState } from "react";
import { MAX_VIDEO_BYTES, formatVideoLength, videoTooLongError } from "@/lib/media/limits";
import { PhotoProcessError, UPLOAD_FAILED, compressImage, postJson as post, signedUpload, videoDuration } from "@/components/album/media-client";

const PARALLEL_UPLOADS = 3;
const NAME_KEY = "album-uploader-name";

const VIDEO_TOO_LARGE = "Видеото е преголемо (најмногу 100 MB).";
const VIDEOS_OFF = "Видеа не може да се прикачат за овој настан. Изберете фотографии.";

/** A file the guest's browser refused before upload: only that file is skipped. */
class SkippedFile extends Error {}

function readSavedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // private mode: the name just isn't remembered
  }
}

function isVideo(file: File): boolean {
  return file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
}

/** Sends one photo: compressed in the browser, uploaded, then confirmed. */
async function uploadPhoto(token: string, file: File, uploaderName: string | null) {
  const photo = await compressImage(file);
  const path = await signedUpload(`/api/e/${token}/photos`, photo.blob);
  await post(`/api/e/${token}/photos/confirm`, { path, consent: true, uploader_name: uploaderName, width: photo.width, height: photo.height });
}

/** Sends one video as it is, after checking size and the package's length. */
async function uploadVideo(token: string, file: File, uploaderName: string | null, videoSeconds: number | null) {
  if (videoSeconds === 0) throw new SkippedFile(VIDEOS_OFF);
  if (file.size > MAX_VIDEO_BYTES) throw new SkippedFile(VIDEO_TOO_LARGE);
  const measured = await videoDuration(file);
  const seconds = Number.isFinite(measured) ? measured : null;
  if (videoSeconds !== null && seconds !== null && seconds > videoSeconds) throw new SkippedFile(videoTooLongError(videoSeconds));
  const path = await signedUpload(`/api/e/${token}/videos`, file, { seconds });
  await post(`/api/e/${token}/videos/confirm`, { path, consent: true, uploader_name: uploaderName });
}

function MediaUpload({ token, videoSeconds }: { token: string; videoSeconds: number | null }) {
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withVideo = videoSeconds !== 0;
  const what = withVideo ? "фотографии и видеа" : "фотографии";

  // After mount, so the server-rendered and first client render agree.
  useEffect(() => setName(readSavedName()), []);

  async function uploadAll(files: File[]) {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    saveName(name.trim());
    const uploaderName = name.trim() || null;
    let done = 0;
    let stopped = false;
    setProgress({ done, total: files.length });

    const queue = [...files];
    const worker = async () => {
      while (!stopped && queue.length) {
        const file = queue.shift()!;
        try {
          if (isVideo(file)) await uploadVideo(token, file, uploaderName, videoSeconds);
          else await uploadPhoto(token, file, uploaderName);
          done += 1;
          setProgress({ done, total: files.length });
        } catch (err) {
          setError((err as Error).message || UPLOAD_FAILED);
          // A file the browser can't use only skips that file; a refusal from
          // the server (full album, rate limit) stops the rest too.
          if (!(err instanceof PhotoProcessError) && !(err instanceof SkippedFile)) stopped = true;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL_UPLOADS, files.length) }, worker));
    setBusy(false);
  }

  return (
    <section className="ga-card" aria-labelledby="ga-photos-title">
      <h2 id="ga-photos-title" className="ga-h2">Прикачи {what}</h2>
      <p className="ga-note">
        Споделете ги вашите {what} од славењето. Може да изберете повеќе одеднаш.
        {withVideo && videoSeconds !== null ? ` Видеата можат да бидат до ${formatVideoLength(videoSeconds)}.` : ""}
      </p>

      <label className="ga-label" htmlFor="ga-name">Вашето име (не е задолжително)</label>
      <input id="ga-name" className="ga-input" value={name} maxLength={120} autoComplete="name" onChange={(e) => setName(e.target.value)} />

      <label className="ga-check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Се согласувам {withVideo ? "фотографиите и видеата да бидат прикажани" : "фотографијата да биде прикажана"} во албумот</span>
      </label>

      <label className={`ga-button${!consent || busy ? " is-disabled" : ""}`} htmlFor="ga-files">
        {busy ? "Се прикачува…" : `Изберете ${what}`}
      </label>
      <input
        id="ga-files"
        className="ga-file"
        type="file"
        accept={withVideo ? "image/*,video/*" : "image/*"}
        multiple
        disabled={!consent || busy}
        aria-label={`Изберете ${what}`}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          void uploadAll(files);
        }}
      />

      {progress && (
        <p className="ga-progress" aria-live="polite">
          {progress.done} / {progress.total} прикачени
        </p>
      )}
      {error && (
        <p className="ga-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Which parts of the page the event's package includes (admin spec §4.4). */
export type GuestAlbumFeatures = {
  photos: boolean;
  /** The longest video a guest may add: 0 = photos only, null = no length limit (max_video_seconds, 0151). */
  videoSeconds: number | null;
};

const ALL_FEATURES: GuestAlbumFeatures = { photos: true, videoSeconds: null };

/** Shown to guests instead of the upload form when the album is not in the package. */
function PhotosUnavailable() {
  return (
    <section className="ga-card" aria-labelledby="ga-photos-title" role="status">
      <h2 id="ga-photos-title" className="ga-h2">Прикачи фотографии</h2>
      <p className="ga-note">Споделувањето фотографии не е вклучено за овој настан. Ви благодариме што сакавте да ги споделите вашите моменти!</p>
    </section>
  );
}

/**
 * The guests' QR page body: photos and videos for the shared album (C1, 0151).
 * Greetings are sent from the invitation, after the RSVP.
 */
export function GuestAlbum({ token, features = ALL_FEATURES }: { token: string; features?: GuestAlbumFeatures }) {
  return <div className="ga-stack">{features.photos ? <MediaUpload token={token} videoSeconds={features.videoSeconds} /> : <PhotosUnavailable />}</div>;
}
