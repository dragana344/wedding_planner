// Pure decision logic for public RSVPs (unit-tested without a database).

export type GuestNameRow = { id: string; full_name: string };

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ѓ: "g", е: "e", ж: "z", з: "z", ѕ: "dz", и: "i", ј: "j", к: "k", л: "l", љ: "lj",
  м: "m", н: "n", њ: "nj", о: "o", п: "p", р: "r", с: "s", т: "t", ќ: "k", у: "u", ф: "f", х: "h", ц: "c", ч: "c", џ: "dz", ш: "s",
};

/** Lowercased with single spaces: "  Ана   Петрова " → "ана петрова". */
function tidyName(name: string): string {
  return name.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * A script-free key, so a guest who types "Petar Petrovski" (or "Petar
 * Petrovski" with š/č/ž, or sh/ch/zh) finds "Петар Петровски". It is loose on
 * purpose — ж, з and "zh" all become "z" — which is safe because a key that
 * fits more than one guest matches nobody.
 */
export function looseNameKey(name: string): string {
  const latin = [...tidyName(name)].map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch).join("");
  return latin
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/dzh|dž/g, "dz")
    .replace(/zh/g, "z")
    .replace(/ch/g, "c")
    .replace(/sh/g, "s")
    .replace(/gj|dj|đ/g, "g")
    .replace(/kj/g, "k")
    .replace(/w/g, "v")
    .replace(/y/g, "j");
}

/**
 * The single guest whose name matches, or null when there is no match or more
 * than one: an ambiguous name must never update the wrong person, so it
 * becomes a new guest instead. An exact match (ignoring case and extra
 * spaces) wins; only when nobody matches exactly is the name compared across
 * scripts with looseNameKey.
 */
export function matchGuestByName<T extends GuestNameRow>(guests: readonly T[], fullName: string): T | null {
  const tidy = tidyName(fullName);
  if (!tidy) return null;
  const exact = guests.filter((g) => tidyName(g.full_name) === tidy);
  if (exact.length > 0) return exact.length === 1 ? exact[0] : null;
  const key = looseNameKey(fullName);
  const loose = guests.filter((g) => looseNameKey(g.full_name) === key);
  return loose.length === 1 ? loose[0] : null;
}

/** Words of a name, lowercased, for order-free comparison. */
function nameWords(name: string): string {
  return name.trim().toLowerCase().split(/\s+/).sort().join(" ");
}

/**
 * A7: a guest's greeting is signed with first and last name (Session 4's
 * event_greetings has no guest link); it is theirs when the words match the
 * guest's name in either order.
 */
export function greetingMatchesGuest(fullName: string, firstName: string, lastName: string): boolean {
  return nameWords(fullName) === nameWords(`${firstName} ${lastName}`);
}

// ---------------------------------------------------------------------------
// Shared-link matching (group B task 1)

/** A guest as the shared link's matching sees it. */
export type GuestMatchRow = GuestNameRow & { phone: string | null };

/**
 * A phone number as one comparable string of digits, with the country code:
 * "070 123 456", "+389 70 123 456", "00389 70/123-456" and "70123456" are
 * all "38970123456". Null when it is too short to tell people apart.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  const trimmed = (phone ?? "").trim();
  let digits = trimmed.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (trimmed.startsWith("+")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `389${digits.slice(1)}`;
  // A local number typed without its leading 0.
  if (digits.length === 8) digits = `389${digits}`;
  return digits;
}

export type SharedMatch =
  | { kind: "apply"; guestId: string; match: "remembered" | "phone" | "exact" }
  | { kind: "new" }
  /** Unsure: the couple decides. `candidateIds` are the guests it could be, best first. */
  | { kind: "review"; candidateIds: string[] };

/**
 * Who a shared-link answer belongs to, in this order:
 *   1. the guest this browser remembers from an earlier applied answer;
 *   2. the one guest with the typed phone, when the typed name also fits
 *      that guest at least loosely (`nameFitsGuest`); a phone with a name
 *      that fits someone else, or nobody, is unsure — a phone alone never
 *      decides, so it can't be used to answer for (or find) a listed guest;
 *   3. the one guest with exactly this name (ignoring case and spaces);
 *   4. nobody even loosely (across scripts) named so: a new guest;
 *   5. anything else — several exact namesakes, or only a loose or
 *      cross-script match — is unsure and goes to the couple.
 * Never guesses: an answer applied to the wrong guest silently changes
 * someone else's numbers.
 */
export function decideSharedMatch(
  guests: readonly GuestMatchRow[],
  input: { fullName: string; phone?: string | null; rememberedGuestId?: string | null },
): SharedMatch {
  if (input.rememberedGuestId && guests.some((g) => g.id === input.rememberedGuestId)) {
    return { kind: "apply", guestId: input.rememberedGuestId, match: "remembered" };
  }
  const tidy = tidyName(input.fullName);
  const key = looseNameKey(input.fullName);
  const exact = tidy ? guests.filter((g) => tidyName(g.full_name) === tidy) : [];
  const loose = key ? guests.filter((g) => looseNameKey(g.full_name) === key) : [];
  const named = exact.length > 0 ? exact : loose;

  const phone = normalizePhone(input.phone);
  const byPhone = phone ? guests.filter((g) => normalizePhone(g.phone) === phone) : [];
  if (byPhone.length === 1) {
    const guest = byPhone[0];
    if (named.some((g) => g.id === guest.id) || nameFitsGuest(input.fullName, guest.full_name)) return { kind: "apply", guestId: guest.id, match: "phone" };
    return { kind: "review", candidateIds: unique([guest.id, ...named.map((g) => g.id)]) };
  }

  if (exact.length === 1) return { kind: "apply", guestId: exact[0].id, match: "exact" };
  if (named.length === 0) return { kind: "new" };
  return { kind: "review", candidateIds: unique([...byPhone.map((g) => g.id), ...named.map((g) => g.id)]) };
}

/**
 * Whether a typed name fits a guest's name at least loosely: every word
 * typed (compared across scripts, in any order) is a word of the guest's
 * name — "Ана", "Petrova Ana" and "Ана Петрова" all fit "Ана Петрова".
 * Used only together with a matching phone.
 */
export function nameFitsGuest(typed: string, guestName: string): boolean {
  const typedWords = looseNameKey(typed).split(" ").filter(Boolean);
  if (typedWords.length === 0) return false;
  const guestWords = new Set(looseNameKey(guestName).split(" ").filter(Boolean));
  return typedWords.every((w) => guestWords.has(w));
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * The guests a pending answer most likely belongs to, best first, for the
 * couple's "Ова е …" choice: same phone, same name, same name across
 * scripts, then anyone sharing a word of the name (a surname). At most `limit`.
 */
export function suggestGuests<T extends GuestMatchRow>(guests: readonly T[], fullName: string, phone: string | null, limit = 5): T[] {
  const tidy = tidyName(fullName);
  const key = looseNameKey(fullName);
  const words = new Set(key.split(" ").filter((w) => w.length >= 3));
  const norm = normalizePhone(phone);
  const score = (g: T): number => {
    if (norm && normalizePhone(g.phone) === norm) return 4;
    if (tidyName(g.full_name) === tidy) return 3;
    if (looseNameKey(g.full_name) === key) return 2;
    return looseNameKey(g.full_name)
      .split(" ")
      .some((w) => words.has(w))
      ? 1
      : 0;
  };
  return guests
    .map((g) => ({ g, s: score(g) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.g.full_name.localeCompare(b.g.full_name, "mk"))
    .slice(0, limit)
    .map((x) => x.g);
}
