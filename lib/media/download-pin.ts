// ZIP downloads in parts (the album's "Преземи ги сите" and the keepsake's
// "Фотографии и видеа") plan the parts again on every part request. A photo
// added between two part requests would move files across the part
// boundaries, so one file could come twice and another never. The page that
// shows the part links fixes a moment (`before`) and every part is planned
// from the files added before it. A file hidden or deleted in between simply
// drops out of the later parts — acceptable.
//
// Client-safe: AlbumClient builds the same links in the browser.

/** The moment the download page rendered; files added after it wait for the next visit. */
export function downloadPin(now: Date = new Date()): string {
  return now.toISOString();
}

/** The link to one part, pinned to `before`. */
export function partHref(base: string, part: number, before: string): string {
  return `${base}?part=${part}&before=${encodeURIComponent(before)}`;
}

/**
 * `before` from a part request: undefined when absent (an old link: plan
 * from every file), null when it isn't a timestamp (the route answers 400).
 */
export function parseDownloadPin(searchParams: URLSearchParams): string | undefined | null {
  const raw = searchParams.get("before");
  if (raw === null) return undefined;
  const at = new Date(raw);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(raw) || Number.isNaN(at.getTime())) return null;
  return at.toISOString();
}
