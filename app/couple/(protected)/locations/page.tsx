import { headers } from "next/headers";
import { listLocations } from "@/lib/couple/locations";
import { getEventSummary } from "@/lib/couple/dashboard";
import { LocationsClient } from "@/components/couple/LocationsClient";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [locations, summary] = await Promise.all([listLocations(eventId), getEventSummary(eventId)]);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <LocationsClient initialLocations={locations} coupleNames={summary.couple_names} eventDate={summary.event_date} />
    </main>
  );
}
