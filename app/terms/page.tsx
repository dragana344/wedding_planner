import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { getTerms } from "@/lib/legal/terms";

const doc = getTerms("mk");

export const metadata: Metadata = {
  title: `${doc.title} — КАДЕ СУМ?`,
  description: doc.description,
};

export default function Page() {
  return <LegalPage doc={doc} alternateHref="/en/terms" />;
}
