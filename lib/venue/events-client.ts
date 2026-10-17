// Browser-side counterparts to the gated functions in lib/venue/events.ts
// (createEvent, updateEvent, deleteEvent, updateEventContactInfo,
// updateEventFinance) — these call the new /api/venue/events routes instead
// of writing to Supabase directly, attaching the manager-elevation token so
// the server can independently verify it (spec D2). No "server-only": this
// file is imported from "use client" components.
import type { CreateEventInput, UpdateEventInput, EventContactInfo, EventFinanceInfo } from "@/lib/venue/events";
import { reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";

const MANAGER_TOKEN_HEADER = "x-venue-manager-token";

async function post<T>(url: string, method: string, body: unknown, managerToken: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (managerToken) headers[MANAGER_TOKEN_HEADER] = managerToken;
  const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // A 403 here means the server no longer honours this token (expired or
    // revoked) — tell the provider so the stale "Менаџер: X" badge and
    // gated controls clear instead of only surfacing this one error.
    if (response.status === 403) reportElevationRejected();
    throw new Error(data?.error ?? "Акцијата не успеа.");
  }
  return data as T;
}

export function createEventViaApi(input: CreateEventInput, managerToken: string | null): Promise<{ id: string }> {
  return post("/api/venue/events", "POST", input, managerToken);
}

export async function updateEventViaApi(eventId: string, input: UpdateEventInput, managerToken: string | null): Promise<void> {
  await post(`/api/venue/events/${eventId}`, "PATCH", input, managerToken);
}

export async function deleteEventViaApi(eventId: string, managerToken: string | null): Promise<void> {
  await post(`/api/venue/events/${eventId}`, "DELETE", undefined, managerToken);
}

export async function updateEventContactInfoViaApi(eventId: string, input: EventContactInfo, managerToken: string | null): Promise<void> {
  await post(`/api/venue/events/${eventId}/contact`, "PATCH", input, managerToken);
}

export async function updateEventFinanceViaApi(eventId: string, input: EventFinanceInfo, managerToken: string | null): Promise<void> {
  await post(`/api/venue/events/${eventId}/finance`, "PATCH", input, managerToken);
}

export async function regenerateEventPasswordViaApi(eventId: string, password: string, managerToken: string | null): Promise<void> {
  await post(`/api/venue/events/${eventId}/regenerate-password`, "POST", { password }, managerToken);
}
