import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { locationBody } from "@/lib/api/schemas";
import { listLocations, addLocation } from "@/lib/couple/locations";

export const GET = withCoupleEvent(
  async ({ eventId }) => NextResponse.json(await listLocations(eventId)),
  { fallbackError: "Не успеа вчитувањето на локациите." },
);

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const created = await addLocation(eventId, { label: body.label, address: body.address || null, map_url: body.map_url || null });
    return NextResponse.json(created);
  },
  { body: locationBody, fallbackError: "Не успеа додавањето на локацијата." },
);
