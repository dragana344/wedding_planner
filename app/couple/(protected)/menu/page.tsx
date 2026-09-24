import { headers } from "next/headers";
import { getVenueMenuOptions, getMenuItemQuantities } from "@/lib/couple/menu";
import { getEventSummary } from "@/lib/couple/dashboard";
import { MenuTemplatePicker } from "@/components/couple/MenuTemplatePicker";
import { CustomMenuBuilder } from "@/components/couple/CustomMenuBuilder";

export default async function CoupleMenuPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [{ templates, specialItems, currentSelection }, quantities, { guest_count_estimate }] = await Promise.all([
    getVenueMenuOptions(eventId),
    getMenuItemQuantities(eventId),
    getEventSummary(eventId),
  ]);

  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <MenuTemplatePicker
        templates={templates}
        currentSelection={currentSelection}
        initialQuantities={quantities}
        guestCountEstimate={guest_count_estimate}
      />
      <div className="my-8 border-t border-neutral-100" />
      <CustomMenuBuilder
        items={specialItems}
        currentSelection={currentSelection}
        initialQuantities={quantities}
        guestCountEstimate={guest_count_estimate}
      />
    </main>
  );
}
