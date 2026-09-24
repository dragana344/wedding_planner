// app/api/couple/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { deleteCoupleSession } from "@/lib/couple/session-verify";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("couple_session")?.value;
  if (token) await deleteCoupleSession(token);
  const response = NextResponse.json({ ok: true });
  response.cookies.delete("couple_session");
  return response;
}
