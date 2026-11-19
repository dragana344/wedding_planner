import { KitchenSheet } from "@/components/venue/print/KitchenSheet";
import { kitchenSheetData } from "@/lib/venue/kitchen-sheet";
import { staffPrintAccess } from "../access";

export const dynamic = "force-dynamic";

// The kitchen sheet (0182): any staff of the venue, like the event window's
// "Бројки за мени" — it shows only what the couple's sending already gave the venue.
export default async function VenueKitchenSheetPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { supabase } = await staffPrintAccess(eventId);
  const data = await kitchenSheetData(supabase, eventId);
  return <KitchenSheet data={data} backHref="/venue/events" />;
}
