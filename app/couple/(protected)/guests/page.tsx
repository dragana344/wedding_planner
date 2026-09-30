import { headers } from "next/headers";
import { listGuests, getGuestStats } from "@/lib/couple/guests";
import { getEventSummary } from "@/lib/couple/dashboard";
import { getInvitation } from "@/lib/couple/invitations";
import { emailConfigured } from "@/lib/email";
import { GuestsClient } from "@/components/couple/GuestsClient";
import { CoOrganizersPanel } from "@/components/couple/guests/CoOrganizersPanel";
import { ReminderPanel } from "@/components/couple/guests/ReminderPanel";
import { getReminder } from "@/lib/couple/reminders";
import { listCoOrganizers } from "@/lib/couple/co-organizers";
import { COUPLE_ORGANIZER_SIDE_HEADER } from "@/lib/couple/session-verify";
import { getEventFeatures } from "@/lib/entitlements/server";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const requestHeaders = await headers();
  const eventId = requestHeaders.get("x-couple-event-id")!;
  // A12: set by proxy.ts for a co-organizer's session only.
  const sideHeader = requestHeaders.get(COUPLE_ORGANIZER_SIDE_HEADER);
  const organizerSide = sideHeader === "bride" || sideHeader === "groom" ? sideHeader : null;
  const [guests, stats, summary, invitation, reminder, features] = await Promise.all([
    listGuests(eventId),
    getGuestStats(eventId),
    getEventSummary(eventId),
    getInvitation(eventId),
    getReminder(eventId),
    getEventFeatures(eventId),
  ]);
  // What the package includes (the routes refuse the rest; this only hides it).
  const sendingEnabled = features.personal_invite_links.enabled;
  const remindersEnabled = features.reminders.enabled;
  const coOrganizersEnabled = features.co_organizers.enabled && features.co_organizers.limit !== 0;
  const share = {
    slug: invitation?.public_slug ?? null,
    coupleNames: summary.couple_names,
    eventDate: summary.event_date,
    venueName: summary.venue_name,
    eventType: summary.event_type,
    emailEnabled: emailConfigured(),
  };
  const coOrganizers =
    !organizerSide && coOrganizersEnabled && summary.event_type === "wedding" ? await listCoOrganizers(eventId) : null;
  return (
    <main style={{ padding: "18px 22px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
      <GuestsClient
        initialGuests={guests}
        initialStats={stats}
        eventType={summary.event_type}
        share={share}
        organizerSide={organizerSide}
        sendingEnabled={sendingEnabled}
      />
      {remindersEnabled ? <ReminderPanel initial={reminder} guests={guests} share={share} organizerSide={organizerSide} /> : null}
      {coOrganizers ? <CoOrganizersPanel initial={coOrganizers} /> : null}
    </main>
  );
}
