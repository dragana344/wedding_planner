import type { GuestSide } from "@/lib/couple/guests";
import { COUPLE_ORGANIZER_SIDE_HEADER } from "@/lib/couple/session-verify";

/**
 * The co-organizer's side for this request (A12), or null for the couple's
 * own login. proxy.ts sets the header from the session and strips any the
 * browser sent, so only its values reach a route.
 */
export function organizerSide(request: Request): GuestSide | null {
  const side = request.headers.get(COUPLE_ORGANIZER_SIDE_HEADER);
  return side === "bride" || side === "groom" ? side : null;
}

export const MAIN_LOGIN_ONLY_ERROR = "Само главната најава на младенците може да управува со ко-организатори.";
