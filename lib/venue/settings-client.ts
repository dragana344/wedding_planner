// Browser-side Settings writes: each goes through /api/venue/settings with
// the manager-elevation token, which the server re-checks is the owner's
// (spec D4) — staff have no direct UPDATE on venues since 0106. Same split
// as lib/venue/events-client.ts. No "server-only": imported from client components.
import { isPhoneNumber, VENUE_PHONE_ERROR } from "@/lib/venue/venue-profile";
import { uploadVenuePhoto } from "@/lib/venue/photo-upload-client";
import { reportElevationRejected } from "@/components/venue/shell/ManagerElevationContext";

const MANAGER_TOKEN_HEADER = "x-venue-manager-token";

async function call<T>(url: string, init: RequestInit, managerToken: string | null): Promise<T> {
  const headers = new Headers(init.headers);
  if (managerToken) headers.set(MANAGER_TOKEN_HEADER, managerToken);
  const response = await fetch(url, { ...init, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // A 403 means the server no longer honours this token (expired or
    // revoked): drop the stale "Менаџер: X" badge and gated controls too.
    if (response.status === 403) reportElevationRejected();
    throw new Error(data?.error ?? "Не успеа зачувувањето. Обидете се повторно.");
  }
  return data as T;
}

function patch(body: unknown, managerToken: string | null): Promise<unknown> {
  return call("/api/venue/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, managerToken);
}

export async function saveVenueName(name: string, managerToken: string | null): Promise<void> {
  await patch({ field: "name", name }, managerToken);
}

export async function saveVenueProfile(input: { address: string | null; phone: string | null }, managerToken: string | null): Promise<void> {
  // Checked here too so a typo is explained without a round trip.
  if (input.phone?.trim() && !isPhoneNumber(input.phone.trim())) throw new Error(VENUE_PHONE_ERROR);
  await patch({ field: "profile", ...input }, managerToken);
}

export async function saveVenueBrandColor(color: string | null, managerToken: string | null): Promise<void> {
  await patch({ field: "brand_color", color }, managerToken);
}

export async function saveLayoutLockPassword(password: string, managerToken: string | null): Promise<void> {
  await patch({ field: "layout_password", password }, managerToken);
}

export async function saveAccountEmail(email: string, managerToken: string | null): Promise<void> {
  await patch({ field: "account_email", email }, managerToken);
}

export async function saveAccountPassword(password: string, managerToken: string | null): Promise<void> {
  await patch({ field: "account_password", password }, managerToken);
}

/** Uploads a new logo and returns its public URL (the server re-checks the file). */
export async function uploadLogo(file: File, managerToken: string | null): Promise<string> {
  return (await uploadVenuePhoto<{ url: string }>("/api/venue/settings/logo", file, managerToken, "Не успеа прикачувањето на логото.")).url;
}

export async function removeLogo(managerToken: string | null): Promise<void> {
  await call("/api/venue/settings/logo", { method: "DELETE" }, managerToken);
}
