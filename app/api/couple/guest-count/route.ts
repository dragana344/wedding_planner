import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function PATCH(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Не сте најавени" }, { status: 401 });

  let guestCount: number | null;
  try {
    ({ guest_count_estimate: guestCount } = await request.json());
  } catch {
    return NextResponse.json({ error: "Неважечко JSON тело" }, { status: 400 });
  }
  if (guestCount !== null && (typeof guestCount !== "number" || guestCount < 0)) {
    return NextResponse.json({ error: "Бројот на гости мора да биде не-негативен број." }, { status: 400 });
  }

  const client = createServiceRoleClient();
  const { error } = await client.from("events").update({ guest_count_estimate: guestCount }).eq("id", eventId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ guest_count_estimate: guestCount });
}
