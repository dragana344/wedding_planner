import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { idParams, locationBody } from "@/lib/api/schemas";
import { updateLocation, deleteLocation } from "@/lib/couple/locations";

export const PATCH = withCoupleEvent(
  async ({ eventId, params, body }) => {
    const updated = await updateLocation(eventId, params.id, {
      label: body.label,
      address: body.address || null,
      map_url: body.map_url || null,
    });
    return NextResponse.json(updated);
  },
  { params: idParams, body: locationBody, fallbackError: "Не успеа ажурирањето на локацијата." },
);

export const DELETE = withCoupleEvent(
  async ({ eventId, params }) => {
    await deleteLocation(eventId, params.id);
    return NextResponse.json({ ok: true });
  },
  { params: idParams, fallbackError: "Не успеа бришењето на локацијата." },
);
