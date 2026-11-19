import "server-only";
import { timingSafeEqual } from "crypto";
import { pseudonymize } from "@/lib/security/pseudonym";

// The shared link's memory of who answered (group B task 1): after an answer
// is applied to a guest, the browser keeps a signed token naming that guest
// (localStorage, per invitation), so a later visit from the same phone
// updates the same guest instead of matching the typed name again. Same
// shape as the greeting tickets (lib/couple/invite-greetings.ts), with its
// own signing purpose so neither can stand in for the other.

const REMEMBER_SECONDS = 180 * 24 * 60 * 60;

function signature(eventId: string, body: string): string {
  return pseudonymize(`rsvp-remember:${eventId}`, body);
}

export function issueRememberToken(eventId: string, guestId: string, now = Date.now()): string {
  const body = `${guestId}.${Math.floor(now / 1000) + REMEMBER_SECONDS}`;
  return `${body}.${signature(eventId, body)}`;
}

/** The guest a token names, or null when it is malformed, expired or for another event. */
export function readRememberToken(eventId: string, token: string | null | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const match = /^([0-9a-f-]{36})\.(\d{1,12})\.([0-9a-f]{64})$/.exec(token);
  if (!match) return null;
  const [, guestId, expires, sig] = match;
  if (Number(expires) * 1000 < now) return null;
  const expected = Buffer.from(signature(eventId, `${guestId}.${expires}`));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected) ? guestId : null;
}
