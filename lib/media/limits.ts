// Limits and display helpers for the guest album (Session 4, C1/C5–C7).
// Pure: used by the API, the couple's album and the guests' upload page.

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;
/** Photos are resized in the browser so their longer edge is at most this. */
export const PHOTO_MAX_EDGE = 2560;
/** Album space per event until the package's `storage_gb` entitlement exists. */
export const DEFAULT_STORAGE_BYTES = 5 * 1024 ** 3;

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** "13,2 GB", "20 GB", "850 MB" — Macedonian decimal comma. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) {
    const value = Math.round((bytes / GB) * 10) / 10;
    return `${String(value).replace(".", ",")} GB`;
  }
  return `${Math.round(bytes / MB)} MB`;
}

export type StorageUsage = { limitBytes: number; photoBytes: number; videoBytes: number };

export type StorageBreakdown = {
  usedBytes: number;
  freeBytes: number;
  photoPct: number;
  videoPct: number;
  freePct: number;
  full: boolean;
};

/** The "my storage" bar: photos, videos and what is left, in whole percent. */
export function storageBreakdown({ limitBytes, photoBytes, videoBytes }: StorageUsage): StorageBreakdown {
  const usedBytes = photoBytes + videoBytes;
  const base = Math.max(limitBytes, usedBytes, 1);
  const photoPct = Math.round((photoBytes / base) * 100);
  const videoPct = Math.round((videoBytes / base) * 100);
  return {
    usedBytes,
    freeBytes: Math.max(0, limitBytes - usedBytes),
    photoPct,
    videoPct,
    freePct: Math.max(0, 100 - photoPct - videoPct),
    full: usedBytes >= limitBytes,
  };
}

/** Dimensions scaled down so the longer edge is at most `maxEdge`. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (longer <= maxEdge) return { width, height };
  const scale = maxEdge / longer;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
