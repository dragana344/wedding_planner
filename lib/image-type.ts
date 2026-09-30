// Identifies an image by its first bytes ("magic numbers"), never by file name
// or declared content type (SEC-005). Only raster formats every guest's
// browser displays; SVG and everything else is refused.

export type ImageExtension = "jpg" | "png" | "gif" | "webp" | "avif";

export const IMAGE_SNIFF_BYTES = 32;

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...Array.from(bytes.subarray(from, to)));
}

export function sniffImageType(bytes: Uint8Array): ImageExtension | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) return "gif";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(bytes, 8, 12))) return "avif";
  return null;
}
