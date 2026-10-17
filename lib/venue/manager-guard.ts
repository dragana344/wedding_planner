import "server-only";
import { validateManagerElevation } from "@/lib/venue/manager-elevation";

export const MANAGER_TOKEN_HEADER = "x-venue-manager-token";

export type ManagerGuardResult = { managerId: string; managerName: string; isOwner: boolean };

/**
 * A manager-or-owner elevation for `venueId`, re-verified against the
 * database on every call (spec D2/§5) — never trust a client-asserted flag.
 * Null for a missing header, or a token that's invalid, expired, or belongs
 * to a different venue.
 */
export async function requireManagerElevation(request: Request, venueId: string): Promise<ManagerGuardResult | null> {
  const token = request.headers.get(MANAGER_TOKEN_HEADER);
  if (!token) return null;
  return validateManagerElevation(token, venueId);
}

/** Same as requireManagerElevation, but only the venue's one owner qualifies. */
export async function requireOwnerElevation(request: Request, venueId: string): Promise<ManagerGuardResult | null> {
  const result = await requireManagerElevation(request, venueId);
  return result?.isOwner ? result : null;
}
