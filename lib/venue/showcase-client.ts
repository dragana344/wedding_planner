// Browser-side showcase photo writes (Фотографии за промоција): manager-only
// since 0107, through /api/venue/events/[eventId]/showcase with the
// elevation token. No "server-only": imported from client components.
import type { ShowcasePhoto } from "@/lib/venue/showcase";
import { uploadVenuePhoto } from "@/lib/venue/photo-upload-client";
import { reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";

const MANAGER_TOKEN_HEADER = "x-venue-manager-token";

export function addShowcasePhotoViaApi(eventId: string, file: File, managerToken: string | null): Promise<ShowcasePhoto> {
  return uploadVenuePhoto(`/api/venue/events/${eventId}/showcase`, file, managerToken, "Не успеа прикачувањето на фотографијата.");
}

export async function deleteShowcasePhotoViaApi(eventId: string, photoId: string, managerToken: string | null): Promise<void> {
  const headers: Record<string, string> = {};
  if (managerToken) headers[MANAGER_TOKEN_HEADER] = managerToken;
  const response = await fetch(`/api/venue/events/${eventId}/showcase/${photoId}`, { method: "DELETE", headers });
  if (!response.ok) {
    // A 403 means the server no longer honours this token (expired or
    // revoked): drop the stale "Менаџер: X" badge and gated controls too.
    if (response.status === 403) reportElevationRejected();
    const data = await response.json().catch(() => null);
    throw new Error(data?.error ?? "Не успеа бришењето на фотографијата.");
  }
}
