import { Cormorant_Garamond } from "next/font/google";

// Serif with Cyrillic italics for the printed plan and QR cards (MASTER §5).
// Self-hosted by next/font, so CSP font-src 'self' holds.
export const printSerif = Cormorant_Garamond({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--s3-serif",
  display: "swap",
});
