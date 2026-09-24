// app/api/couple/invitation/photo/route.ts
import { NextRequest, NextResponse } from "next/server";
import { uploadInvitationPhoto } from "@/lib/couple/invitations";

export async function POST(request: NextRequest) {
  const eventId = request.headers.get("x-couple-event-id");
  if (!eventId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided." }, { status: 400 });
    const path = await uploadInvitationPhoto(eventId, file);
    return NextResponse.json({ photo_path: path });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to upload photo." }, { status: 400 });
  }
}
