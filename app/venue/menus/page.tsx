import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import { listMenuItems, listMenuTemplatesWithItemCounts } from "@/lib/venue/menus";
import { MenusClient } from "@/components/venue/dashboard/MenusClient";

// Same stale-Router-Cache fix as /venue/reservations.
export const dynamic = "force-dynamic";

export default async function MenusPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;
  const [everydayItems, specialItems, templates] = await Promise.all([
    listMenuItems(venueId, "everyday", supabase),
    listMenuItems(venueId, "special", supabase),
    listMenuTemplatesWithItemCounts(venueId, supabase),
  ]);

  return (
    <MenusClient
      venueId={venueId}
      initialEverydayItems={everydayItems}
      initialSpecialItems={specialItems}
      initialTemplates={templates}
    />
  );
}
