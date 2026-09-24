import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function PATCH(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { contact_email?: string | null; contact_email_2?: string | null; contact_phone?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const client = createServiceRoleClient();
  const { error } = await client
    .from("events")
    .update({
      contact_email: body.contact_email ?? null,
      contact_email_2: body.contact_email_2 ?? null,
      contact_phone: body.contact_phone ?? null,
    })
    .eq("id", eventId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
