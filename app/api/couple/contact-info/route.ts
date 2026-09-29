import { NextResponse } from "next/server";
import { withCoupleEvent } from "@/lib/api/handler";
import { contactInfoBody } from "@/lib/api/schemas";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// No fallbackError: this route never caught handler errors, so they still
// propagate to Next.js unchanged.
export const PATCH = withCoupleEvent(
  async ({ eventId, body }) => {
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
  },
  { invalidJsonError: "Неважечко JSON тело", body: contactInfoBody },
);
