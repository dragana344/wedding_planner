import { headers } from "next/headers";
import { listLocations } from "@/lib/couple/locations";
import { LocationsClient } from "@/components/couple/LocationsClient";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const locations = await listLocations(eventId);
  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <LocationsClient initialLocations={locations} />
    </main>
  );
}
