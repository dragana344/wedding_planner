// lib/api/handler.ts
//
// Shared wrapper for App Router API route handlers. It owns the steps every
// route used to hand-copy:
//
//   1. resolve the caller (for couple routes: the `x-couple-event-id` header
//      that proxy.ts injects after validating the session cookie),
//   2. validate the dynamic params and parse + validate the JSON body
//      against the route's schemas (SEC-004, lib/api/schemas.ts),
//   3. turn a thrown error into the route's `{ error }` JSON response.
//
// Behaviour is deliberately identical to the pre-wrapper routes (same bodies,
// messages and status codes). This is the single seam later work plugs into:
// error sanitising (SEC-003), input validation (SEC-004) and logging (OBS-002).

import { NextRequest, NextResponse } from "next/server";
import type { ZodType } from "zod";
import { INVALID_ID_ERROR, INVALID_INPUT_ERROR, parseInput } from "@/lib/api/schemas";
import { REQUEST_ID_HEADER, errorFields, log } from "@/lib/log";

export const COUPLE_EVENT_HEADER = "x-couple-event-id";
export const NOT_AUTHENTICATED_ERROR = "Не сте најавени";

/**
 * Parsed JSON request body when a route declares no `body` schema. Every
 * route in app/api declares one (SEC-004); this stays as the untyped default
 * for the wrapper's generic signature.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JsonBody = any;

/**
 * Next.js passes dynamic route segments as the handler's second argument; since
 * Next 15 they arrive as a Promise. A plain object is accepted too (tests).
 */
export type RouteContext<P> = { params: Promise<P> | P };

export type RouteHandler<P> = (request: NextRequest, context: RouteContext<P>) => Promise<Response>;

export type HandlerOptions<B = JsonBody, P = unknown> = {
  /**
   * Message used when a thrown value is not an `Error`. When set, any error
   * thrown by the handler (including a failed body parse under `parseJson`)
   * becomes `{ error: err.message | fallbackError }` with status 400.
   * When omitted, errors are not caught and propagate to Next.js.
   */
  fallbackError?: string;
  /**
   * Parse the body with `request.json()` inside the error boundary, so an
   * invalid body is reported through `fallbackError` handling.
   */
  parseJson?: boolean;
  /**
   * Parse the body with `request.json()` before running the handler, outside
   * the error boundary; an invalid body returns `{ error: invalidJsonError }`
   * with status 400. Takes precedence over `parseJson`.
   */
  invalidJsonError?: string;
  /**
   * Schema for the parsed JSON body (implies `parseJson` when neither parse
   * option is set). A body that fails it gets `{ error }` with status 400 and
   * the handler never runs; the handler receives the parsed value, which
   * carries only the schema's whitelisted keys.
   */
  body?: ZodType<B>;
  /** Message for a body that fails `body` (default "Неважечки податоци."). */
  invalidBodyError?: string;
  /**
   * Schema for the dynamic route params, checked before the body is read.
   * A mismatch gets `{ error }` with status 400.
   */
  params?: ZodType<P>;
  /** Message for params that fail `params` (default "Неважечки идентификатор."). */
  invalidParamsError?: string;
};

export type PublicHandlerContext<P, B = JsonBody> = {
  request: NextRequest;
  params: P;
  /** Parsed (and, with a `body` schema, validated) body; else undefined. */
  body: B;
};

export type CoupleEventHandlerContext<P, B = JsonBody> = PublicHandlerContext<P, B> & {
  eventId: string;
};

/** The route's standard error response: `{ error }` with status 400. */
/**
 * Messages our own code throws on purpose (`throw new Error("...")`) are meant
 * for the user. Everything else — PostgREST, Storage and Auth errors (all
 * Error subclasses), TypeErrors, anything carrying a `code` — can reveal table,
 * column or constraint names, so the route's fallback message is shown
 * instead and the original is logged (SEC-003).
 */
export function isUserFacingError(err: unknown): err is Error {
  return err instanceof Error && err.constructor === Error && !("code" in err);
}

/** The route's standard error response: `{ error }` with status 400. */
export function errorResponse(err: unknown, fallbackError: string, request?: Request): NextResponse {
  if (!isUserFacingError(err)) {
    log("error", "api_error", {
      request_id: request?.headers.get(REQUEST_ID_HEADER) ?? undefined,
      route: request ? routeLabel(request) : undefined,
      ...errorFields(err),
    });
  }
  return NextResponse.json({ error: isUserFacingError(err) ? err.message : fallbackError }, { status: 400 });
}

/**
 * The request path with ids and invitation slugs replaced, so logs never hold
 * a slug (it is the guest's credential) and group by route.
 */
export function routeLabel(request: Request): string {
  return new URL(request.url).pathname
    .replace(/\/invite\/[^/]+/, "/invite/:slug")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
}

/**
 * One structured line per API request (OBS-002). Unhandled errors are logged
 * and rethrown so Next.js still answers 500 exactly as before.
 */
export async function withRequestLog<T extends Response>(request: Request, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const fields = { request_id: request.headers.get(REQUEST_ID_HEADER) ?? undefined, method: request.method, route: routeLabel(request) };
  try {
    const response = await run();
    log(response.status >= 500 ? "error" : "info", "api_request", { ...fields, status: response.status, duration_ms: Date.now() - started });
    return response;
  } catch (err) {
    log("error", "api_request", { ...fields, status: 500, duration_ms: Date.now() - started, ...errorFields(err) });
    throw err;
  }
}

function invalid(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function run<P, B>(
  request: NextRequest,
  rawParams: P,
  options: HandlerOptions<B, P>,
  handler: (request: NextRequest, params: P, body: B) => Promise<Response>,
): Promise<Response> {
  const { fallbackError, invalidJsonError, body: bodySchema, params: paramsSchema } = options;
  const parseJson = options.parseJson ?? (bodySchema !== undefined && invalidJsonError === undefined);

  let params = rawParams;
  if (paramsSchema) {
    const parsed = parseInput(paramsSchema, rawParams, options.invalidParamsError ?? INVALID_ID_ERROR);
    if (!parsed.success) return invalid(parsed.error);
    params = parsed.data;
  }

  let body: JsonBody = undefined;
  if (invalidJsonError !== undefined) {
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: invalidJsonError }, { status: 400 });
    }
  }

  const execute = async () => {
    if (parseJson && invalidJsonError === undefined) body = await request.json();
    if (bodySchema) {
      const parsed = parseInput(bodySchema, body, options.invalidBodyError ?? INVALID_INPUT_ERROR);
      if (!parsed.success) return invalid(parsed.error);
      body = parsed.data;
    }
    return handler(request, params, body);
  };

  if (fallbackError === undefined) return execute();
  try {
    return await execute();
  } catch (err) {
    return errorResponse(err, fallbackError, request);
  }
}

/**
 * Wraps a route that needs no caller identity (public endpoints).
 */
export function withPublic<P = Record<string, never>, B = JsonBody>(
  handler: (ctx: PublicHandlerContext<P, B>) => Promise<Response>,
  options: HandlerOptions<B, P> = {},
): RouteHandler<P> {
  return (request, context) =>
    withRequestLog(request, async () =>
      run(request, await context?.params, options, (req, params, body) => handler({ request: req, params, body })),
    );
}

/**
 * Wraps a couple-dashboard route. Returns `{ error: "Не сте најавени" }` with
 * status 401 when the middleware did not attach an event id; otherwise hands
 * the handler the event id, route params and (optionally) the parsed body.
 */
export function withCoupleEvent<P = Record<string, never>, B = JsonBody>(
  handler: (ctx: CoupleEventHandlerContext<P, B>) => Promise<Response>,
  options: HandlerOptions<B, P> = {},
): RouteHandler<P> {
  return (request, context) =>
    withRequestLog(request, async () => {
      const eventId = request.headers.get(COUPLE_EVENT_HEADER);
      if (!eventId) return NextResponse.json({ error: NOT_AUTHENTICATED_ERROR }, { status: 401 });
      return run(request, await context?.params, options, (req, params, body) =>
        handler({ request: req, params, body, eventId }),
      );
    });
}
