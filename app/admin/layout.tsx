import type { Metadata } from "next";
import "@/app/venue/panel.css";

// Private area: keep out of search engines (COMP-004), same as the venue and
// couple panels.
export const metadata: Metadata = { title: "Админ — Каде си?", robots: { index: false, follow: false } };

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
