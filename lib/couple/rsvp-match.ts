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
