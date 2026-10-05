import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getEventSummary } from "@/lib/couple/dashboard";
import { getEventFeatures } from "@/lib/entitlements/server";
import { FEATURE_KEYS } from "@/lib/entitlements/features";
import { CoupleShell } from "@/components/couple/shell/CoupleShell";
import { getEventBranding } from "@/lib/venue/branding";
import "@/app/venue/panel.css";

// Private area: keep out of search engines (COMP-004).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CoupleLayout({ children }: { children: React.ReactNode }) {
  const eventId = (await headers()).get("x-couple-event-id");
  if (!eventId) redirect("/couple/login");

  const [summary, features, brand] = await Promise.all([getEventSummary(eventId), getEventFeatures(eventId), getEventBranding(eventId)]);
  const lockedFeatures = FEATURE_KEYS.filter((k) => !features[k].enabled);

  return (
    <CoupleShell coupleNames={summary.couple_names} eventDate={summary.event_date} rooms={summary.rooms} lockedFeatures={lockedFeatures} brand={brand}>
      {children}
    </CoupleShell>
  );
}
