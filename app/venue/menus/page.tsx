import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentVenueId } from "@/lib/venue/current-venue";
import {
  listEventCustomMenus,
  listMenuItems,
  listMenuTemplatesWithItems,
} from "@/lib/venue/menus";
import { MenusClient } from "@/components/venue/dashboard/MenusClient";

// Same stale-Router-Cache fix as /venue/reservations.
export const dynamic = "force-dynamic";

export default async function MenusPage() {
  const supabase = await createServerSupabaseClient();
  const venueId = await getCurrentVenueId(supabase);
  // No venue: the layout decides (none → /login, blocked → BlockedScreen); render nothing.
  if (!venueId) return null;
  const [items, templates, customMenus] = await Promise.all([
    listMenuItems(venueId, supabase),
    listMenuTemplatesWithItems(venueId, supabase),
    listEventCustomMenus(venueId, supabase),
  ]);

  return (
    <MenusClient
      venueId={venueId}
      initialItems={items}
      initialTemplates={templates}
      initialCustomMenus={customMenus}
    />
  );
}
