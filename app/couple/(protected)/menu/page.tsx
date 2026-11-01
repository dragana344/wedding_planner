import { headers } from "next/headers";
import { getEventMenus } from "@/lib/couple/menu";
import { getGuestStats } from "@/lib/couple/guests";
import { EventMenusView } from "@/components/couple/EventMenusView";
import { ChangeNotice } from "@/components/couple/ChangeNotice";
import { coupleNotice } from "@/lib/changes/couple-notice";
import { loadCoupleMarks, NO_MARKS } from "@/lib/couple/change-marks";

export default async function CoupleMenuPage() {
  const eventId = (await headers()).get("x-couple-event-id")!;
  const [menus, stats, marks] = await Promise.all([
    getEventMenus(eventId),
    getGuestStats(eventId),
    // The boxes are a hint: the page works without them.
    loadCoupleMarks(eventId).catch((e) => {
      console.error("Could not load the change marks", e);
      return NO_MARKS;
    }),
  ]);
  const menusNotice = coupleNotice("menus", marks.unseen.menus);
  const venueNumbers = marks.venueNumbersUnseen;

  return (
    <main style={{ padding: "18px 22px 28px" }}>
      {menusNotice ? <ChangeNotice {...menusNotice} /> : null}
      {venueNumbers ? (
        <ChangeNotice
          section="menu_numbers"
          title="Внесено од салата"
          lines={[
            ...venueNumbers.numbers.menus.map((m) => ({ key: m.id, text: `${m.name}: ${m.count}` })),
            { key: "total", text: `Вкупно: ${venueNumbers.numbers.total}` },
          ]}
          upTo={venueNumbers.sentAt}
        />
      ) : null}
      <EventMenusView menus={menus} totals={stats.menus.map((m) => ({ id: m.id, count: m.count }))} />
    </main>
  );
}
