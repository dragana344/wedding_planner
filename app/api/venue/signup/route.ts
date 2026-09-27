import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { provisionVenueForUser } from "@/lib/venue/provisioning";

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { venue_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.venue_name !== "string" || !body.venue_name.trim()) {
    return NextResponse.json({ error: "Venue name is required." }, { status: 400 });
  }

  try {
    const result = await provisionVenueForUser(user.id, body.venue_name.trim());
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create venue." }, { status: 400 });
  }
}
