// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { validateAndRenewCoupleSession } from "@/lib/couple/session-verify";

const UNGATED_PATHS = new Set(["/couple/login", "/api/couple/login"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("couple_session")?.value;

  const headers = new Headers(request.headers);
  headers.delete("x-couple-event-id");

  if (UNGATED_PATHS.has(pathname)) {
    if (pathname === "/couple/login" && token) {
      const session = await validateAndRenewCoupleSession(token);
      if (session) return NextResponse.redirect(new URL("/couple", request.url));
    }
    return NextResponse.next({ request: { headers } });
  }

  const session = token ? await validateAndRenewCoupleSession(token) : null;
  if (!session) {
    if (pathname.startsWith("/api/couple")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/couple/login", request.url));
  }

  headers.set("x-couple-event-id", session.eventId);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/couple/:path*", "/api/couple/:path*"],
};
