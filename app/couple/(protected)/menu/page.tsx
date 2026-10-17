import { headers } from "next/headers";
import { getVenueMenuOptions, getMenuItemQuantities } from "@/lib/couple/menu";
import { getEventSummary } from "@/lib/couple/dashboard";
import { MenuPicker } from "@/components/couple/MenuPicker";

export default async function CoupleMenuPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [{ templates, specialItems, currentSelection }, quantities, summary] = await Promise.all([
    getVenueMenuOptions(eventId),
    getMenuItemQuantities(eventId),
    getEventSummary(eventId),
  ]);

  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <MenuPicker
        templates={templates}
        specialItems={specialItems}
        currentSelection={currentSelection}
        initialQuantities={quantities}
        guestCountEstimate={summary.guest_count_estimate}
        coupleNames={summary.couple_names}
        eventDate={summary.event_date}
      />
    </main>
  );
}
