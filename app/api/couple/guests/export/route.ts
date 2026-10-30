import { withCoupleEvent } from "@/lib/api/handler";
import { guestsToCsv } from "@/lib/couple/guest-csv";
import { listGuests, getEventMenuNames } from "@/lib/couple/guests";

// A20: the couple's guest list as a spreadsheet download.
export const GET = withCoupleEvent(
  async ({ eventId }) => {
    const [guests, menus] = await Promise.all([listGuests(eventId), getEventMenuNames(eventId)]);
    return new Response(guestsToCsv(guests, menus), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="gosti.csv"',
        "cache-control": "no-store",
      },
    });
  },
  { fallbackError: "Не успеа извозот на гостите." },
);
