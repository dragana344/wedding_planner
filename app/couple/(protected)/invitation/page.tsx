// app/couple/(protected)/invitation/page.tsx
import { headers } from "next/headers";
import { getInvitation } from "@/lib/couple/invitations";
import { getEventSummary } from "@/lib/couple/dashboard";
import { InvitationClient } from "@/components/couple/InvitationClient";

export const dynamic = "force-dynamic";

export default async function InvitationPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [invitation, summary] = await Promise.all([getInvitation(eventId), getEventSummary(eventId)]);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <InvitationClient initialInvitation={invitation} coupleNames={summary.couple_names} eventDate={summary.event_date} />
    </main>
  );
}
