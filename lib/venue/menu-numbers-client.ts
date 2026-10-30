// Browser-side call that marks the couple's latest menu numbers as seen
// (Видено, manager-only). No "server-only": imported from client components.
import { reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";

const MANAGER_TOKEN_HEADER = "x-venue-manager-token";

/** Thrown when the couple has sent newer numbers than the ones the manager confirmed. */
export class NewerMenuNumbersError extends Error {}

export async function markMenuNumbersSeenViaApi(eventId: string, submissionId: string, token: string | null): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  const response = await fetch(`/api/venue/events/${eventId}/menu-numbers/seen`, { method: "POST", headers, body: JSON.stringify({ submission_id: submissionId }) });
  if (response.status === 409) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new NewerMenuNumbersError(data?.error ?? "Парот испрати нови бројки — освежете.");
  }
  if (!response.ok) {
    // A 403 means the server no longer honours this token: drop the stale badge.
    if (response.status === 403) reportElevationRejected();
    throw new Error("Не успеа означувањето како видено.");
  }
}
