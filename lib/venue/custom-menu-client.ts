// Browser-side call that saves an event's custom menu (manager-only).
// No "server-only": imported from client components.
import { LOCKED_MESSAGE } from "@/lib/entitlements/features";
import { reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";

const MANAGER_TOKEN_HEADER = "x-venue-manager-token";

export async function saveCustomMenuViaApi(
  eventId: string,
  input: { name: string; itemIds: string[] },
  token: string | null,
): Promise<{ id: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  const response = await fetch(`/api/venue/events/${eventId}/custom-menu`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ name: input.name, item_ids: input.itemIds }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // A locked feature is also a 403, but the manager login is still valid.
    if (response.status === 403 && data?.error !== LOCKED_MESSAGE)
      reportElevationRejected();
    throw new Error(data?.error ?? "Не успеа зачувувањето на менито.");
  }
  return data as { id: string };
}

async function callCustomMenu(
  path: string,
  method: "DELETE" | "POST",
  token: string | null,
  fallback: string,
) {
  const headers: Record<string, string> = {};
  if (token) headers[MANAGER_TOKEN_HEADER] = token;
  const response = await fetch(path, { method, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 403 && data?.error !== LOCKED_MESSAGE)
      reportElevationRejected();
    throw new Error(data?.error ?? fallback);
  }
  return data;
}

export async function deleteCustomMenuViaApi(
  templateId: string,
  token: string | null,
): Promise<void> {
  await callCustomMenu(
    `/api/venue/menus/custom/${templateId}`,
    "DELETE",
    token,
    "Не успеа бришењето на менито.",
  );
}

export async function copyCustomMenuViaApi(
  templateId: string,
  token: string | null,
): Promise<{ id: string }> {
  return (await callCustomMenu(
    `/api/venue/menus/custom/${templateId}/copy`,
    "POST",
    token,
    "Не успеа создавањето на пакетот.",
  )) as { id: string };
}

/**
 * Whether the event's plan includes the custom menu (manager-only read).
 * Any failure counts as enabled: the save itself still decides.
 */
export async function fetchCustomMenuEnabled(
  eventId: string,
  token: string | null,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers[MANAGER_TOKEN_HEADER] = token;
    const response = await fetch(`/api/venue/events/${eventId}/custom-menu`, { headers });
    if (!response.ok) return true;
    const data = (await response.json()) as { enabled?: unknown };
    return data.enabled !== false;
  } catch {
    return true;
  }
}
