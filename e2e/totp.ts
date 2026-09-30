import { createHmac } from "crypto";

// RFC 6238 TOTP, 30s step / 6 digits — same algorithm as
// tests/supabase/admin_guard.test.ts and tests/supabase/mfa_staff.test.ts,
// shared here so the E2E admin flow can compute a code from a Base32 secret
// returned by `supabase.auth.mfa.enroll()` without pulling in an extra
// dependency.
export function totp(base32: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of base32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}
