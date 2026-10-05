import type { Metadata } from "next";
import localFont from "next/font/local";
import { Archivo_Black, Manrope, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});
// Panel typography, per the Diamond design system. Cyrillic subset is required —
// the entire venue panel UI is in Macedonian.
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-data",
});

export const metadata: Metadata = {
  title: "Каде си?",
  description: "Платформа за ресторани и сали за настани: резервации, распоред на маси, покани и гости.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="mk" data-scroll-behavior="smooth">
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} ${archivoBlack.variable} ${manrope.variable} ${plexSans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
