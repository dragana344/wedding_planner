// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { validateAndRenewCoupleSession } from "@/lib/couple/session-verify";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { REQUEST_ID_HEADER } from "@/lib/log";

const UNGATED_COUPLE_PATHS = new Set(["/couple/login", "/api/couple/login"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence (SEC-015): a state-changing request to our API must come from
 * our own origin. Browsers always send Origin on cross-origin POST/PATCH/PUT/
 * DELETE, so a foreign or "null" Origin is refused. Requests with neither
 * Origin nor Referer are not from a browser page and carry no ambient-cookie
 * risk, so they pass (the route's own auth still applies).
 */
export function isCrossOriginMutation(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!source) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(source).host !== host;
  } catch {
    return true;
  }
}

/** Couple panel and API: our own opaque session cookie. */
async function gateCouple(request: NextRequest, requestId: string): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("couple_session")?.value;

  const headers = new Headers(request.headers);
  headers.delete("x-couple-event-id");
  headers.set(REQUEST_ID_HEADER, requestId);

  if (UNGATED_COUPLE_PATHS.has(pathname)) {
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

/**
 * Venue panel (AUTH-001): the documented @supabase/ssr middleware refresh.
 * Server components cannot write cookies, so without this a venue session
 * silently dies at the first JWT expiry. getClaims() verifies the JWT
 * (locally when the project uses asymmetric signing keys) and refreshes an
 * expired access token, writing the new cookies onto the response.
 */
async function refreshVenueSession(request: NextRequest, requestId: string): Promise<NextResponse> {
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    return NextResponse.next({ request: { headers } });
  };
  let response = forward();
  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = forward();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  // Pages redirect at the edge; the layout's staff check stays as defence in
  // depth. API routes keep answering with their own 401s.
  if (!signedIn && request.nextUrl.pathname.startsWith("/venue")) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}

export async function middleware(request: NextRequest) {
  return route(request, crypto.randomUUID());
}

/**
 * Every request through middleware gets an id (OBS-002), forwarded to the
 * route as x-request-id and echoed on the response, so a user-reported error
 * can be matched to its log lines. A client-supplied id is never trusted.
 */
async function route(request: NextRequest, requestId: string): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  let response: NextResponse;

  if (pathname.startsWith("/api/") && isCrossOriginMutation(request)) {
    response = NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (pathname === "/couple" || pathname.startsWith("/couple/") || pathname.startsWith("/api/couple/")) {
    response = await gateCouple(request, requestId);
  } else if (pathname === "/venue" || pathname.startsWith("/venue/") || pathname.startsWith("/api/venue/")) {
    response = await refreshVenueSession(request, requestId);
  } else {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    response = NextResponse.next({ request: { headers } });
  }
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ["/couple/:path*", "/api/:path*", "/venue/:path*"],
};
