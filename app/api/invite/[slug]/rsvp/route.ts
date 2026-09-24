import { NextRequest, NextResponse } from "next/server";
import { submitRsvpBySlug } from "@/lib/couple/rsvp";

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  let body: { full_name?: string; attending?: boolean; party_size?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.full_name !== "string" || typeof body.attending !== "boolean") {
    return NextResponse.json({ error: "full_name and attending are required." }, { status: 400 });
  }

  try {
    await submitRsvpBySlug(params.slug, {
      fullName: body.full_name,
      attending: body.attending,
      partySize: typeof body.party_size === "number" ? body.party_size : 1,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to submit RSVP." }, { status: 400 });
  }
}
