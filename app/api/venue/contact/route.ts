import { NextRequest, NextResponse } from "next/server";
import { submitContactMessage } from "@/lib/venue/contact";

export async function POST(request: NextRequest) {
  let body: { name?: string; email?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body.name !== "string" || !body.name.trim() ||
    typeof body.email !== "string" || !body.email.trim() ||
    typeof body.message !== "string" || !body.message.trim()
  ) {
    return NextResponse.json({ error: "Name, email, and message are required." }, { status: 400 });
  }

  try {
    await submitContactMessage({ name: body.name, email: body.email, message: body.message });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to send message." }, { status: 400 });
  }
}
