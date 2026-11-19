import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { guestImportBody } from "@/lib/api/schemas";
import { parseGuestCsv } from "@/lib/couple/guest-csv";
import { importGuests } from "@/lib/couple/guests";
import { coupleChangerName } from "@/lib/changes/server";
import { organizerSide } from "@/lib/couple/organizer-side";
import { noteNumbersChange } from "@/lib/couple/numbers-changes";

// A20: add guests from a CSV. All or nothing: any bad line imports no one, so
// fixing the file and uploading it again cannot half-duplicate the list.
export const POST = withCoupleEvent(
  async ({ request, eventId, body }) => {
    const { rows, errors } = parseGuestCsv(body.csv);
    if (errors.length > 0) {
      const message = errors
        .slice(0, 5)
        .map((e) => `Ред ${e.line}: ${e.message}`)
        .join(" ");
      return NextResponse.json({ error: errors.length > 5 ? `${message} (и уште ${errors.length - 5})` : message }, { status: 400 });
    }
    if (rows.length === 0) return NextResponse.json({ error: "Датотеката нема гости." }, { status: 400 });
    const result = await importGuests(eventId, rows);
    await noteNumbersChange(eventId, coupleChangerName(organizerSide(request)));
    return NextResponse.json(result);
  },
  { body: guestImportBody, fallbackError: "Не успеа увозот на гостите." },
);
