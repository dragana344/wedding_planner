import "server-only";
import { createHmac } from "crypto";

// Pseudonyms for IP addresses and similar identifiers (rate-limit keys, RSVP
// audit). A keyed HMAC, not a plain hash: without the server secret nobody can
// brute-force the ~4 billion IPv4 addresses back out of a stored value
// (SEC-025 SR-03). Key: IP_PSEUDONYM_SECRET, else the service-role key (both
// server-only; rotating either just starts fresh rate-limit windows).
export function pseudonymize(purpose: string, value: string): string {
  const secret = process.env.IP_PSEUDONYM_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No server secret configured for pseudonymisation.");
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}
