// Venue branding (0087): from the one accent colour a venue picks, the set of
// CSS custom properties the panels paint with. The panel design is built on
// a gold family (--gold, --gold-lo, --gold-hi, two tints) with dark text on
// gold surfaces; a venue's colour can be anything, so every member of the
// family is derived here and the text colour is chosen by contrast.

export const BRAND_COLOR_RE = /^#[0-9a-f]{6}$/;

/** "#0E9F95" / " #0e9f95 " → "#0e9f95"; anything else → null. */
export function normalizeBrandColor(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  return BRAND_COLOR_RE.test(v) ? v : null;
}

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** `amount` of the way from `rgb` to `target` (0 = unchanged, 1 = target). */
function mix(rgb: Rgb, target: Rgb, amount: number): Rgb {
  return rgb.map((c, i) => c + (target[i] - c) * amount) as Rgb;
}

/** WCAG relative luminance. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(toRgb(a)), luminance(toRgb(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const DARK_TEXT = "#1b1508";

/** Darkens `rgb` step by step until it reads on white at `ratio`:1 (links, icons on tints). */
function readableOnWhite(rgb: Rgb, ratio: number): Rgb {
  let current = rgb;
  for (let i = 0; i < 20 && contrastRatio(toHex(current), "#ffffff") < ratio; i++) current = mix(current, BLACK, 0.1);
  return current;
}

const SIDEBAR = "#14161b";

/** Lightens `rgb` step by step until it stands out on the dark sidebar at `ratio`:1. */
function visibleOnSidebar(rgb: Rgb, ratio: number): Rgb {
  let current = rgb;
  for (let i = 0; i < 20 && contrastRatio(toHex(current), SIDEBAR) < ratio; i++) current = mix(current, WHITE, 0.12);
  return current;
}

/**
 * Dark or white text for a surface painted as a gradient between these
 * colours (buttons and the active nav item run from the lighter shade to the
 * base): whichever keeps the better contrast at its weakest point.
 */
function textOn(...surface: string[]): string {
  const worst = (text: string) => Math.min(...surface.map((c) => contrastRatio(c, text)));
  return worst(DARK_TEXT) >= worst("#ffffff") ? DARK_TEXT : "#ffffff";
}

export type BrandVars = Record<`--${string}`, string>;

/**
 * The custom properties to set on a panel's root for this colour, or null
 * for no/invalid colour (the panel then keeps its own gold).
 */
export function brandVars(color: string | null | undefined): BrandVars | null {
  const base = normalizeBrandColor(color);
  if (!base) return null;
  const rgb = toRgb(base);
  const hi = toHex(mix(rgb, WHITE, 0.18));
  const onGold = textOn(base, hi);
  // The sidebar is near-black: a dark accent (navy, charcoal) would vanish on
  // it, so the active item and the buttons there get a lightened variant.
  const side = visibleOnSidebar(rgb, 3);
  const sideHex = toHex(side);
  const sideHi = toHex(mix(side, WHITE, 0.18));
  return {
    "--gold": base,
    "--gold-hi": hi,
    // Used for text and icons on white and on the tints, so it must stay readable there.
    "--gold-lo": toHex(readableOnWhite(mix(rgb, BLACK, 0.12), 3)),
    "--gold-text": toHex(readableOnWhite(rgb, 4.5)),
    "--gold-tint": toHex(mix(rgb, WHITE, 0.88)),
    "--gold-tint-2": toHex(mix(rgb, WHITE, 0.76)),
    "--on-gold": onGold,
    "--on-gold-soft": onGold === DARK_TEXT ? "#4a3a11" : "rgba(255, 255, 255, 0.86)",
    "--side-gold": sideHex,
    "--side-gold-hi": sideHi,
    "--side-gold-lo": toHex(mix(side, BLACK, 0.12)),
    "--side-on-gold": textOn(sideHex, sideHi),
  };
}
