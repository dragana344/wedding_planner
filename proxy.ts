// proxy.ts (Next.js 16's name for middleware)
import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAdminHost } from "@/lib/admin/host";
import { COUPLE_ORGANIZER_SIDE_HEADER, validateAndRenewCoupleSession } from "@/lib/couple/session-verify";
import { isMaintenanceModeStale, peekMaintenanceMode, refreshMaintenanceMode } from "@/lib/platform-settings";
import { supabaseAnonKey, supabaseUrl } from "@/lib/env";
import { REQUEST_ID_HEADER } from "@/lib/log";
import { safeEqual } from "@/lib/security/safe-equal";

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
  headers.delete(COUPLE_ORGANIZER_SIDE_HEADER);
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
  // Session 2 (A12): a co-organizer's side of the family; absent for the couple's own login.
  if (session.organizerSide) headers.set(COUPLE_ORGANIZER_SIDE_HEADER, session.organizerSide);
  return NextResponse.next({ request: { headers } });
}

/**
 * The documented @supabase/ssr middleware refresh (AUTH-001), shared by the
 * venue panel and the admin host. Server components cannot write cookies, so
 * without this a session silently dies at the first JWT expiry — and with
 * refresh-token rotation + reuse detection, a later refresh from a server
 * component cannot rescue it either. getClaims() verifies the JWT (locally
 * when the project uses asymmetric signing keys) and refreshes an expired
 * access token; the new cookies are written onto the request (so this
 * request's server components already see them) and onto the response.
 * `forward` builds the response to return; it is called again after a
 * refresh so its forwarded request headers carry the new cookies.
 */
async function refreshSupabaseSession(
  request: NextRequest,
  forward: () => NextResponse,
): Promise<{ response: NextResponse; signedIn: boolean }> {
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
  return { response, signedIn: Boolean(data?.claims?.sub) };
}

/** Venue panel (AUTH-001): refresh the session, redirect signed-out pages. */
async function refreshVenueSession(request: NextRequest, requestId: string): Promise<NextResponse> {
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set(REQUEST_ID_HEADER, requestId);
    return NextResponse.next({ request: { headers } });
  };
  const { response, signedIn } = await refreshSupabaseSession(request, forward);
  const isPage = request.nextUrl.pathname.startsWith("/venue");
  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  // Pages redirect at the edge; the layout's staff check stays as defence in
  // depth. API routes keep answering with their own 401s.
  if (!signedIn) return isPage ? redirectTo("/login") : response;

  // SEC-016 is enforced by the database, not here: is_venue_staff_for and
  // the venue_staff policy (migration 0044) hide all venue data from an aal1
  // session of a user with a verified factor, so the panel layout finds no
  // staff row and sends them to /login, which asks for the code. Checking
  // here would cost an Auth round trip on every request of every user
  // without MFA.
  return response;
}

function requestHost(request: NextRequest): string | null {
  return request.headers.get("x-forwarded-host") ?? request.headers.get("host");
}

export async function proxy(request: NextRequest, event?: NextFetchEvent) {
  const requestId = crypto.randomUUID();
  const { pathname } = request.nextUrl;

  // Admin dashboard (spec §3.1): its own host, never the main site's paths.
  if (isAdminHost(requestHost(request))) {
    // Observed against a real `next build && next start`: the previous,
    // simpler version of this block (clone the URL, set .pathname, always
    // .rewrite()) 404'd on every admin.<host> request — the "main host
    // serving /admin" branch below fired instead of the real page. Cause:
    // this rewrite's destination still matches this proxy's own `matcher`,
    // so Next re-invokes the proxy for it, and on that second pass
    // request.nextUrl.host (and the `host` header derived from it) is Next's
    // own loopback address, never "admin.<host>" (see next/dist/shared/lib/
    // get-hostname.js). Setting `url.host` to the real admin host instead of
    // working around this made Next treat the destination as a different
    // *origin* and try to reverse-proxy the request over the network to it
    // ("Failed to proxy ... socket hang up") — worse. The fix below —
    // forward the real host via x-forwarded-host (requestHost() already
    // prefers it) and rewrite at most once, passing through
    // (NextResponse.next()) once the pathname already has its final
    // "/admin..." form — was confirmed against a real `next start` (curl)
    // and by e2e/admin.spec.ts.
    //
    // Trust assumption: requestHost() trusts x-forwarded-host, which is
    // safe only behind a proxy that sets/overwrites it itself (Vercel does).
    // A bare `next start` exposed directly, with nothing in front rewriting
    // that header, would let a request to the *main* host reach these pages
    // just by sending its own `x-forwarded-host: admin.<domain>` — routing
    // only, not an auth bypass (requireAdmin() still gates every admin page
    // and Server Action). See docs/production/ADMIN.md.
    //
    // The admin session is refreshed here exactly like the venue one
    // (refreshSupabaseSession): without it the admin is logged out at the
    // first access-token expiry. No redirect for a signed-out request —
    // requireAdmin() on every page and action is the gate.
    const targetPathname = pathname === "/admin" || pathname.startsWith("/admin/") ? pathname : `/admin${pathname === "/" ? "" : pathname}`;
    const adminHost = requestHost(request)!;
    const forward = () => {
      // Rebuilt after a refresh, so the forwarded cookie header is current.
      const headers = new Headers(request.headers);
      headers.set("x-forwarded-host", adminHost);
      headers.set(REQUEST_ID_HEADER, requestId);
      if (targetPathname === pathname) return NextResponse.next({ request: { headers } });
      const url = request.nextUrl.clone();
      url.pathname = targetPathname;
      return NextResponse.rewrite(url, { request: { headers } });
    };
    const { response } = await refreshSupabaseSession(request, forward);
    response.headers.set(REQUEST_ID_HEADER, requestId);
    return response;
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const notFound = new NextResponse("Not found", { status: 404 });
    notFound.headers.set(REQUEST_ID_HEADER, requestId);
    return notFound;
  }

  // Stale-while-revalidate (controller ruling): this is a hot path and must
  // never *await* the maintenance flag's own database call. maintenanceResponse
  // only ever reads the synchronous, in-memory cache (peekMaintenanceMode).
  // When that cache is stale or cold, kick off exactly one deduped refresh
  // and hand it to event.waitUntil so the runtime can let it finish after
  // the response is sent, without this request ever waiting on it — with
  // Supabase unreachable, awaiting it here would stack on top of route()'s
  // own bounded DB calls (e.g. the couple session lookup) and blow past
  // REL-004's latency bound (tests/supabase/timeouts.test.ts). If `event`
  // isn't provided (e.g. a unit test calling proxy() directly), the refresh
  // just runs detached instead — still never awaited.
  if (isMaintenanceModeStale()) {
    const refreshing = refreshMaintenanceMode().catch(() => {});
    event?.waitUntil?.(refreshing);
  }

  const maintenance = maintenanceResponse(request);
  if (maintenance) return maintenance;
  return route(request, requestId);
}

const MAINTENANCE_COOKIE = "maintenance_bypass";

const MAINTENANCE_PAGE = `<!doctype html>
<html lang="mk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Одржување — КАДЕ СУМ?</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf8f4;color:#1d1a16;font-family:Arial,Helvetica,sans-serif}
main{max-width:28rem;padding:2rem;text-align:center}p{line-height:1.6;color:#5c554b}small{color:#8a8275}</style></head>
<body><main><p style="letter-spacing:.2em;color:#a8842c;font-weight:bold">КАДЕ СУМ?</p>
<h1>Кратко одржување</h1><p>Ја подобруваме платформата. Обидете се повторно за неколку минути — вашите податоци се безбедни.</p>
<small>We're doing a short maintenance. Please try again in a few minutes.</small></main></body></html>`;

/**
 * REL-007: with MAINTENANCE_MODE=1, or the DB flag set from the admin
 * System page (task 4.1, spec §5 item 7), everyone gets a 503 maintenance
 * page (API callers a JSON 503) except the team, who open any URL once with
 * ?maintenance_bypass=<MAINTENANCE_BYPASS_TOKEN> to get a bypass cookie.
 * /api/health keeps reporting the real state for uptime monitoring. The
 * admin host never reaches this function at all — proxy() returns for it
 * earlier — so admin access is unaffected either way.
 *
 * Synchronous by design: the DB flag is read via peekMaintenanceMode()
 * (last known value, refreshed in the background by proxy() — see there),
 * never awaited here.
 */
export function maintenanceResponse(request: NextRequest): NextResponse | null {
  if (process.env.MAINTENANCE_MODE !== "1" && !peekMaintenanceMode()) return null;
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/api/health") return null;

  const token = process.env.MAINTENANCE_BYPASS_TOKEN;
  if (token) {
    if (safeEqual(request.cookies.get(MAINTENANCE_COOKIE)?.value, token)) return null;
    if (safeEqual(searchParams.get(MAINTENANCE_COOKIE), token)) {
      const clean = request.nextUrl.clone();
      clean.searchParams.delete(MAINTENANCE_COOKIE);
      const redirect = NextResponse.redirect(clean);
      redirect.cookies.set(MAINTENANCE_COOKIE, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60 });
      return redirect;
    }
  }

  const headers = { "Retry-After": "600", "Cache-Control": "no-store" };
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Услугата е привремено недостапна поради одржување." }, { status: 503, headers });
  }
  return new NextResponse(MAINTENANCE_PAGE, { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
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
  // Everything except build assets, so maintenance mode (REL-007) covers the
  // marketing and invitation pages too. Non-panel paths only get a request id.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
