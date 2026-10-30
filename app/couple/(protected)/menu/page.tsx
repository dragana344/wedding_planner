import { headers } from "next/headers";
import { getEventMenus } from "@/lib/couple/menu";
import { getGuestStats } from "@/lib/couple/guests";
import { EventMenusView } from "@/components/couple/EventMenusView";

export default async function CoupleMenuPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [menus, stats] = await Promise.all([getEventMenus(eventId), getGuestStats(eventId)]);

  return (
    <main style={{ padding: "18px 22px 28px" }}>
      <EventMenusView menus={menus} totals={stats.menus.map((m) => ({ id: m.id, count: m.count }))} />
    </main>
  );
}
