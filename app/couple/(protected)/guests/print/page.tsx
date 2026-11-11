import { headers } from "next/headers";
import { listGuests, getEventMenuNames } from "@/lib/couple/guests";
import { getEventSummary } from "@/lib/couple/dashboard";
import { buildPrintGuestGroups } from "@/lib/couple/guest-print";
import { formatMkDate } from "@/lib/date";
import { PrintGuestList } from "@/components/couple/guests/print/PrintGuestList";
import { printSerif } from "@/components/seating/print/font";

export const dynamic = "force-dynamic";

/** The couple's own guest list, ready to print or save as PDF via the browser's print dialog. */
export default async function GuestsPrintPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [guests, menus, summary] = await Promise.all([listGuests(eventId), getEventMenuNames(eventId), getEventSummary(eventId)]);
  const groups = buildPrintGuestGroups(guests, menus, summary.event_type === "wedding");
  return (
    <PrintGuestList
      title={summary.couple_names}
      subtitle={`${formatMkDate(summary.event_date)} · ${summary.venue_name}`}
      groups={groups}
      fontClassName={printSerif.variable}
      backHref="/couple/guests"
    />
  );
}
