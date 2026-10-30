// Macedonian Cyrillic → Latin, lowercase-only (the only direction the new-event
// wizard needs: suggesting a couple-login username from the typed name).
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", ѓ: "gj", е: "e", ж: "zh", з: "z",
  ѕ: "dz", и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj",
  о: "o", п: "p", р: "r", с: "s", т: "t", ќ: "kj", у: "u", ф: "f", х: "h",
  ц: "c", ч: "ch", џ: "dz", ш: "sh",
};

const MAX_LENGTH = 20;

/**
 * "Ивана & Марко" → "ivana-marko". Transliterates Cyrillic letters, lowercases
 * everything else, and collapses any run of non-alphanumeric characters
 * (spaces, "&", punctuation) into a single hyphen — the same slug shape a
 * typed Latin name already produces.
 */
export function transliterateToSlug(name: string): string {
  const latin = name
    .toLowerCase()
    .split("")
    .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .join("");
  return latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH);
}
