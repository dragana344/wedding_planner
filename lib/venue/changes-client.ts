// Browser-side calls for the venue's change marks: the couple's changes, Видено,
// the reminder and venue-entered menu numbers. The gated ones attach the
// manager-elevation token. No "server-only": imported from client components.
import type { EventChange, SeenSection } from "@/lib/changes/types";
import { reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";

const MANAGER_TOKEN_HEADER = "x-venue-manager-token";

export type EventChangesData = {
  changes: EventChange[];
  seen: Partial<Record<SeenSection, string>>;
  lastReminderAt: string | null;
};

function tokenHeaders(token: string | null): Record<string, string> {
  return token ? { [MANAGER_TOKEN_HEADER]: token } : {};
}

async function post<T>(url: string, body: unknown, token: string | null, fallback: string): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...tokenHeaders(token) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // A 403 means the server no longer honours this token: drop the stale badge.
    // A locked plan feature is also a 403, but the manager login is still valid.
    if (response.status === 403 && data?.error !== LOCKED_MESSAGE) reportElevationRejected();
    throw new Error(data?.error ?? fallback);
  }
  return data as T;
}

/** Any staff may read; without a manager token the contact and finance values come back empty. */
export async function fetchEventChanges(eventId: string, token: string | null): Promise<EventChangesData> {
  const response = await fetch(`/api/venue/events/${eventId}/changes`, { headers: tokenHeaders(token) });
  if (!response.ok) throw new Error("Промените не можеа да се вчитаат.");
  return (await response.json()) as EventChangesData;
}

/** `newer` is true when the couple changed more since `upTo`: the screen should ask for a refresh. */
export async function markChangesSeenViaApi(
  eventId: string,
  section: "guest_count" | "contact",
  upTo: string,
  token: string | null,
): Promise<{ newer: boolean }> {
  const data = await post<{ newer?: boolean }>(`/api/venue/events/${eventId}/changes/seen`, { section, up_to: upTo }, token, "Не успеа означувањето како видено.");
  return { newer: data.newer === true };
}

export function remindCoupleViaApi(eventId: string, token: string | null): Promise<{ remindedAt: string }> {
  return post(`/api/venue/events/${eventId}/remind-couple`, undefined, token, "Не успеа потсетувањето.");
}

export async function enterMenuNumbersViaApi(eventId: string, counts: Record<string, number>, token: string | null): Promise<void> {
  await post(`/api/venue/events/${eventId}/menu-numbers`, { counts }, token, "Не успеа зачувувањето на бројките.");
}
