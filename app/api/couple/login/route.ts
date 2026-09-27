// app/api/couple/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyEventCredentials } from "@/lib/couple/auth";
import { createCoupleSession } from "@/lib/couple/session-token";

const MESSAGES: Record<"invalid" | "locked", string> = {
  invalid: "Неточно корисничко име или лозинка.",
  locked: "Премногу обиди. Обидете се повторно за неколку минути.",
};

export async function POST(request: NextRequest) {
  let username: string;
  let password: string;
  try {
    ({ username, password } = await request.json());
  } catch {
    return NextResponse.json({ error: "Неважечко JSON тело" }, { status: 400 });
  }
  if (!username || !password) {
    return NextResponse.json({ error: "Задолжителни се корисничкото име и лозинката." }, { status: 400 });
  }

  const result = await verifyEventCredentials(username, password);
  if ("errorCode" in result) {
    return NextResponse.json({ error: MESSAGES[result.errorCode] }, { status: 401 });
  }

  const { token, expiresAt } = await createCoupleSession(result.eventId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("couple_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return response;
}
