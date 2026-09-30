// app/couple/(protected)/invitation/page.tsx
import { headers } from "next/headers";
import { getInvitation } from "@/lib/couple/invitations";
import { getEventSummary } from "@/lib/couple/dashboard";
import { InvitationClient } from "@/components/couple/InvitationClient";
import { getEventFeatures } from "@/lib/entitlements/server";

export const dynamic = "force-dynamic";

export default async function InvitationPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [invitation, summary, features] = await Promise.all([getInvitation(eventId), getEventSummary(eventId), getEventFeatures(eventId)]);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <InvitationClient
        initialInvitation={invitation}
        coupleNames={summary.couple_names}
        eventDate={summary.event_date}
        allTemplates={features.invitation_all_templates.enabled}
      />
    </main>
  );
}
