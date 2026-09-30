import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { getDpa } from "@/lib/legal/dpa";

const doc = getDpa("mk");

export const metadata: Metadata = {
  title: `${doc.title} — КАДЕ СУМ?`,
  description: doc.description,
};

export default function Page() {
  return <LegalPage doc={doc} alternateHref="/en/dpa" />;
}
