// Browser half of lib/venue/photo-upload.ts: ask the gated route for a
// one-time signed upload, put the file straight into Storage (no size limit
// from our server), then have the route check and attach it. No "server-only".
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";

const MANAGER_TOKEN_HEADER = "x-venue-manager-token";
const BUCKET = "event-showcase-photos";

async function post<T>(url: string, body: unknown, managerToken: string | null, fallback: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (managerToken) headers[MANAGER_TOKEN_HEADER] = managerToken;
  const response = await fetch(url, { method: "POST", headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // A 403 means the server no longer honours this token (expired or
    // revoked): drop the stale "Менаџер: X" badge and gated controls too.
    if (response.status === 403) reportElevationRejected();
    throw new Error(data?.error ?? fallback);
  }
  return data as T;
}

/** Uploads `file` via `startUrl` (signed upload) and `${startUrl}/confirm`; returns the confirm response. */
export async function uploadVenuePhoto<T>(startUrl: string, file: File, managerToken: string | null, fallback: string): Promise<T> {
  const upload = await post<{ path: string; token: string }>(startUrl, undefined, managerToken, fallback);
  const { error } = await createBrowserSupabaseClient()
    .storage.from(BUCKET)
    // Unique final path per upload: safe to cache for a year (PERF-001).
    .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type || "application/octet-stream", cacheControl: "31536000" });
  if (error) throw new Error("Датотеката не е поддржана слика или е преголема.");
  return post<T>(`${startUrl}/confirm`, { path: upload.path }, managerToken, fallback);
}
