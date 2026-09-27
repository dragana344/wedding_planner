"use client";

export function FloralCorner({ color, flip = false }: { color: string; flip?: boolean }) {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <path d="M4 4c10 2 18 10 20 20M4 4c2 10 10 18 20 20" stroke={color} strokeWidth="1" opacity="0.85" />
      <circle cx="8" cy="8" r="2.5" fill={color} opacity="0.9" />
      <circle cx="16" cy="14" r="2" fill={color} opacity="0.7" />
      <circle cx="12" cy="20" r="1.6" fill={color} opacity="0.6" />
      <path d="M6 10c3 1 5 3 6 6" stroke={color} strokeWidth="0.75" opacity="0.6" />
    </svg>
  );
}

export function FloralHeart({ color }: { color: string }) {
  return (
    <svg width="90" height="60" viewBox="0 0 90 60" fill="none" aria-hidden style={{ margin: "0 auto" }}>
      <path
        d="M45 54C20 40 8 28 8 16 8 7 15 2 23 2c8 0 16 6 22 16C51 8 59 2 67 2c8 0 15 5 15 14 0 12-12 24-37 38Z"
        fill="none"
        stroke={color}
        strokeWidth="1.3"
        opacity="0.85"
      />
      <circle cx="20" cy="14" r="1.8" fill={color} opacity="0.7" />
      <circle cx="70" cy="14" r="1.8" fill={color} opacity="0.7" />
      <circle cx="45" cy="46" r="1.6" fill={color} opacity="0.7" />
    </svg>
  );
}

export function SwanHeart({ color }: { color: string }) {
  return (
    <svg width="120" height="70" viewBox="0 0 120 70" fill="none" aria-hidden style={{ margin: "0 auto" }}>
      <path
        d="M8 40c0-14 12-24 24-16 4 2 6 6 8 10 2-4 4-8 8-10 12-8 24 2 24 16 0 14-18 24-32 30-14-6-32-16-32-30Z"
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        opacity="0.9"
      />
      <path d="M32 34c3-6 8-10 14-11-2 4-2 8 0 12" stroke={color} strokeWidth="1" opacity="0.7" />
      <path d="M88 34c-3-6-8-10-14-11 2 4 2 8 0 12" stroke={color} strokeWidth="1" opacity="0.7" />
      <circle cx="34" cy="27" r="1.2" fill={color} />
      <circle cx="86" cy="27" r="1.2" fill={color} />
    </svg>
  );
}

/** Ornate right-angle corner bracket with a small diamond accent — for the
 * gold "frame" template, evoking an engraved invitation card corner. */
export function GoldFrameCorner({ color, flip = false }: { color: string; flip?: boolean }) {
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <path d="M2 20V2h18" stroke={color} strokeWidth="1.2" />
      <path d="M2 30V2" stroke={color} strokeWidth="0.6" opacity="0.5" />
      <path d="M30 2H2" stroke={color} strokeWidth="0.6" opacity="0.5" />
      <rect x="9" y="9" width="4" height="4" transform="rotate(45 11 11)" fill={color} opacity="0.85" />
    </svg>
  );
}

/** A single thin rule — the entirety of the minimalist template's ornament,
 * deliberately restrained to match "Класичен минималист". */
export function MinimalRule({ color }: { color: string }) {
  return <div style={{ width: 64, height: 1, background: color, opacity: 0.5, margin: "0 auto" }} />;
}

/** Soft translucent color washes suggesting watercolor paint, placed behind
 * the content via absolute positioning by the caller. */
export function WatercolorWash({ color }: { color: string }) {
  return (
    <svg width="100%" height="420" viewBox="0 0 520 420" fill="none" aria-hidden style={{ position: "absolute", top: 0, left: 0, opacity: 0.35 }}>
      <ellipse cx="90" cy="60" rx="120" ry="90" fill={color} opacity="0.35" />
      <ellipse cx="440" cy="120" rx="140" ry="100" fill={color} opacity="0.25" />
      <ellipse cx="260" cy="20" rx="100" ry="60" fill={color} opacity="0.2" />
    </svg>
  );
}

/** Two crossed sprigs of leaves tied with twine — the rustic template's
 * corner motif. */
export function RusticSprig({ color, flip = false }: { color: string; flip?: boolean }) {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" aria-hidden style={{ transform: flip ? "scaleX(-1)" : undefined }}>
      <path d="M6 6c14 2 24 12 28 28" stroke={color} strokeWidth="1.4" opacity="0.85" />
      <path d="M12 12c3 2 5 5 5 9" stroke={color} strokeWidth="1" opacity="0.6" />
      <path d="M18 18c3 2 5 5 5 9" stroke={color} strokeWidth="1" opacity="0.6" />
      <path d="M24 24c3 2 5 5 5 9" stroke={color} strokeWidth="1" opacity="0.6" />
      <circle cx="8" cy="8" r="2" fill={color} opacity="0.8" />
    </svg>
  );
}
