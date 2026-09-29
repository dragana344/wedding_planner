import { withCoupleEvent } from "@/lib/api/handler";
import { guestsToCsv } from "@/lib/couple/guest-csv";
import { listGuests } from "@/lib/couple/guests";

// A20: the couple's guest list as a spreadsheet download.
export const GET = withCoupleEvent(
  async ({ eventId }) =>
    new Response(guestsToCsv(await listGuests(eventId)), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="gosti.csv"',
        "cache-control": "no-store",
      },
    }),
  { fallbackError: "Не успеа извозот на гостите." },
);
