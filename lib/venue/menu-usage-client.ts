// Browser-side read of how many guests picked each of an event's menus
// (manager-only), used to warn before a menu is removed from the event.
// No "server-only": imported from client components.
import { reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";

const MANAGER_TOKEN_HEADER = "x-venue-manager-token";

export async function fetchMenuUsage(eventId: string, token: string | null): Promise<Record<string, number>> {
  const headers: Record<string, string> = {};
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  const response = await fetch(`/api/venue/events/${eventId}/menu-usage`, { headers });
  if (!response.ok) {
    // A 403 means the server no longer honours this token: drop the stale badge.
    if (response.status === 403) reportElevationRejected();
    throw new Error("Не успеа проверката на изборот на гостите.");
  }
  const data = (await response.json()) as { usage?: Record<string, number> };
  return data.usage ?? {};
}
