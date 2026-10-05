import { Montserrat, Nunito } from "next/font/google";

// Shared by the landing page and the auth pages that wear its design.
// Cyrillic subsets are required: these pages are in Macedonian.
export const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700", "800"],
  variable: "--font-montserrat",
});
// Rounded face for the Каде си? wordmark.
export const nunito = Nunito({
  subsets: ["latin", "cyrillic"],
  weight: ["700", "800", "900"],
  variable: "--font-nunito",
});
