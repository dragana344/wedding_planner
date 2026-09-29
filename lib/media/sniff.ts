// Identifies a video greeting by its first bytes, never by file name or
// declared type (same rule as lib/image-type.ts for photos).

export type VideoExtension = "mp4" | "mov" | "webm";

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...Array.from(bytes.subarray(from, to)));
}

// ISO base media brands that are still images, not video.
const IMAGE_BRANDS = new Set(["avif", "avis", "heic", "heix", "mif1", "msf1"]);

export function sniffVideoType(bytes: Uint8Array): VideoExtension | null {
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "qt  ") return "mov";
    if (IMAGE_BRANDS.has(brand)) return null;
    return "mp4";
  }
  return null;
}
