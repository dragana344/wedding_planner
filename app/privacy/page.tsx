import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { getPrivacyPolicy } from "@/lib/legal/privacy";

const doc = getPrivacyPolicy("mk");

export const metadata: Metadata = {
  title: `${doc.title} — Каде си?`,
  description: doc.description,
};

export default function Page() {
  return <LegalPage doc={doc} alternateHref="/en/privacy" />;
}
