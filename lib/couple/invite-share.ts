// Sending a guest their personal invitation (A9): the message text and the
// WhatsApp / Viber / SMS links that open it ready to send. Pure, so it runs in
// the browser and is unit-tested without a database.

export interface InviteMessageInput {
  guestName: string;
  coupleNames: string;
  /** YYYY-MM-DD */
  eventDate: string;
  venueName: string;
  link: string;
  eventType?: string;
}

/** The guest's own invitation link (A1). */
export function personalInviteUrl(origin: string, slug: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${slug}?g=${token}`;
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

export function inviteMessage(input: InviteMessageInput): string {
  const occasion = !input.eventType || input.eventType === "wedding" ? "свадбата" : "прославата";
  return (
    `Почитуван/а ${input.guestName},\n` +
    `со радост Ве покануваме на ${occasion} на ${input.coupleNames} на ${formatDate(input.eventDate)} во ${input.venueName}.\n` +
    `Вашата покана и потврда за доаѓање: ${input.link}`
  );
}

/**
 * International digits for wa.me / sms: ("070 123 456" -> "38970123456").
 * A leading 0 is a Macedonian national number; "+" or "00" is already international.
 */
export function internationalPhone(phone: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) digits = `389${digits.slice(1)}`;
  return digits;
}

export interface ShareLinks {
  whatsapp: string;
  viber: string;
  sms: string;
}

/** Links that open each app with the message filled in; without a phone the app asks for the contact. */
export function shareLinks(phone: string | null, message: string): ShareLinks {
  const text = encodeURIComponent(message);
  const number = internationalPhone(phone);
  return {
    whatsapp: `https://wa.me/${number ?? ""}?text=${text}`,
    // Viber has no "send to number" link with text; forward lets the couple pick the chat.
    viber: `viber://forward?text=${text}`,
    sms: `sms:${number ? `+${number}` : ""}?body=${text}`,
  };
}
