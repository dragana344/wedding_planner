import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { guestCreateBody } from "@/lib/api/schemas";
import { listGuests, addGuest, getGuestStats } from "@/lib/couple/guests";

export const GET = withCoupleEvent(
  async ({ eventId }) => {
    const [guests, stats] = await Promise.all([listGuests(eventId), getGuestStats(eventId)]);
    return NextResponse.json({ guests, stats });
  },
  { fallbackError: "Не успеа вчитувањето на гостите." },
);

export const POST = withCoupleEvent(
  async ({ eventId, body }) => {
    const created = await addGuest(eventId, {
      full_name: body.full_name,
      phone: body.phone || null,
      email: body.email || null,
      party_size: body.party_size ?? 1,
      notes: body.notes || null,
      side: body.side || null,
    });
    return NextResponse.json(created);
  },
  { body: guestCreateBody, fallbackError: "Не успеа додавањето на гостинот." },
);
