import localFont from "next/font/local";
import { Archivo_Black, Manrope, IBM_Plex_Sans } from "next/font/google";

// The same faces app/layout.tsx puts on <body>, so stories look like the app.
const geistSans = localFont({ src: "../app/fonts/GeistVF.woff", variable: "--font-geist-sans", weight: "100 900" });
const geistMono = localFont({ src: "../app/fonts/GeistMonoVF.woff", variable: "--font-geist-mono", weight: "100 900" });
const archivoBlack = Archivo_Black({ subsets: ["latin"], weight: "400", variable: "--font-display" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700", "800"], variable: "--font-sans" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600"], variable: "--font-data" });

export const bodyFontClasses = [geistSans, geistMono, archivoBlack, manrope, plexSans].map((f) => f.variable).join(" ");
