// Limits and display helpers for the guest album (Session 4, C1/C5–C7).
// Pure: used by the API, the couple's album and the guests' upload page.

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 30;
/** Photos are resized in the browser so their longer edge is at most this. */
export const PHOTO_MAX_EDGE = 2560;
const GB = 1024 ** 3;
const MB = 1024 ** 2;

/**
 * Album space from the event's resolved `storage_gb` entitlement: null =
 * unlimited, else whole GB × 1024³. A disabled feature resolves to limit 0
 * (0048), so nothing fits.
 */
export function storageLimitBytes(storageGb: { enabled: boolean; limit: number | null }): number | null {
  if (!storageGb.enabled) return 0;
  if (storageGb.limit === null) return null;
  return Math.max(0, storageGb.limit) * GB;
}

/**
 * Days an album is kept after the event, from the resolved
 * `photo_retention_days`, or null = never purged. Only an enabled feature
 * with a positive limit purges: a disabled or missing feature, an unlimited
 * (null) limit or 0 all keep the album (deleting guests' photos is
 * irreversible, so anything unclear keeps them).
 */
export function retentionDays(feature: { enabled: boolean; limit: number | null } | undefined): number | null {
  if (!feature?.enabled || feature.limit === null) return null;
  const days = Math.floor(feature.limit);
  return days > 0 ? days : null;
}

/** Whether `extraBytes` more still fit under `limitBytes` (null = unlimited). */
export function fitsQuota(limitBytes: number | null, usedBytes: number, extraBytes: number): boolean {
  return limitBytes === null || usedBytes + extraBytes <= limitBytes;
}

/** "13,2 GB", "20 GB", "850 MB" — Macedonian decimal comma. */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) {
    const value = Math.round((bytes / GB) * 10) / 10;
    return `${String(value).replace(".", ",")} GB`;
  }
  return `${Math.round(bytes / MB)} MB`;
}

/** `limitBytes` null = unlimited (the package's storage_gb has no limit). */
export type StorageUsage = { limitBytes: number | null; photoBytes: number; videoBytes: number };

export type StorageBreakdown = {
  usedBytes: number;
  /** null when the space is unlimited. */
  freeBytes: number | null;
  photoPct: number;
  videoPct: number;
  freePct: number;
  full: boolean;
};

/**
 * The "my storage" bar: photos, videos and what is left, in whole percent.
 * Unlimited space shows the split of what is used, with nothing "left".
 */
export function storageBreakdown({ limitBytes, photoBytes, videoBytes }: StorageUsage): StorageBreakdown {
  const usedBytes = photoBytes + videoBytes;
  if (limitBytes === null) {
    const base = Math.max(usedBytes, 1);
    const photoPct = Math.round((photoBytes / base) * 100);
    return { usedBytes, freeBytes: null, photoPct, videoPct: usedBytes > 0 ? 100 - photoPct : 0, freePct: 0, full: false };
  }
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
