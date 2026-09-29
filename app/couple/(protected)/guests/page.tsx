import { headers } from "next/headers";
import { listGuests, getGuestStats } from "@/lib/couple/guests";
import { getEventSummary } from "@/lib/couple/dashboard";
import { getInvitation } from "@/lib/couple/invitations";
import { emailConfigured } from "@/lib/email";
import { GuestsClient } from "@/components/couple/GuestsClient";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [guests, stats, summary, invitation] = await Promise.all([
    listGuests(eventId),
    getGuestStats(eventId),
    getEventSummary(eventId),
    getInvitation(eventId),
  ]);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <GuestsClient
        initialGuests={guests}
        initialStats={stats}
        eventType={summary.event_type}
        share={{
          slug: invitation?.public_slug ?? null,
          coupleNames: summary.couple_names,
          eventDate: summary.event_date,
          venueName: summary.venue_name,
          eventType: summary.event_type,
          emailEnabled: emailConfigured(),
        }}
      />
    </main>
  );
}
