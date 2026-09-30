// A21: every event needs a working email and phone for the couple (invitation
// replies, reminders, the venue reaching them). Checked in the venue's forms
// and again in lib/venue/events before anything is written. Not a database
// constraint: older events and erased events (0043) legitimately have none.
//
// Plain checks, not zod: this runs in the venue's browser forms, and zod's
// JIT probe (`new Function`) is blocked by the CSP there.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CoupleContacts {
  contact_email: string;
  contact_phone: string;
  contact_email_2: string | null;
}

export type CoupleContactsInput = { contact_email?: string | null; contact_phone?: string | null; contact_email_2?: string | null };

function check(input: CoupleContactsInput): string | CoupleContacts {
  const email = (input.contact_email ?? "").trim();
  const phone = (input.contact_phone ?? "").trim();
  const email2 = (input.contact_email_2 ?? "").trim();
  if (!email) return "Внесете email на парот.";
  if (email.length > 254 || !EMAIL_RE.test(email)) return "Неважечки email на парот.";
  if (!phone) return "Внесете телефон на парот.";
  if (phone.length > 50 || phone.replace(/\D/g, "").length < 6) return "Неважечки телефон на парот.";
  if (email2 && (email2.length > 254 || !EMAIL_RE.test(email2))) return "Неважечка втора е-пошта.";
  return { contact_email: email, contact_phone: phone, contact_email_2: email2 || null };
}

export function parseCoupleContacts(input: CoupleContactsInput): { ok: true; data: CoupleContacts } | { ok: false; error: string } {
  const result = check(input);
  return typeof result === "string" ? { ok: false, error: result } : { ok: true, data: result };
}
