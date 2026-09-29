// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import { withCoupleEvent, withPublic, errorResponse } from "@/lib/api/handler";

function req(opts: { eventId?: string; body?: string; method?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts.eventId) headers.set("x-couple-event-id", opts.eventId);
  return new NextRequest("http://localhost/api/test", {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body,
  });
}

async function read(res: Response) {
  return { status: res.status, body: await res.json() };
}

describe("errorResponse", () => {
  it("uses the Error message with status 400", async () => {
    expect(await read(errorResponse(new Error("boom"), "fallback"))).toEqual({ status: 400, body: { error: "boom" } });
  });

  it("uses the fallback for non-Error values", async () => {
    expect(await read(errorResponse("nope", "fallback"))).toEqual({ status: 400, body: { error: "fallback" } });
  });
});

describe("withCoupleEvent", () => {
  it("returns 401 with the Macedonian message when the event header is missing", async () => {
    const handler = vi.fn();
    const route = withCoupleEvent(handler, { fallbackError: "x" });
    expect(await read(await route(req(), { params: {} }))).toEqual({ status: 401, body: { error: "Не сте најавени" } });
    expect(handler).not.toHaveBeenCalled();
  });

  it("passes eventId, params and request to the handler", async () => {
    const route = withCoupleEvent<{ id: string }>(async ({ eventId, params, request }) =>
      Response.json({ eventId, id: params.id, method: request.method }),
    );
    expect(await read(await route(req({ eventId: "ev-1" }), { params: { id: "item-9" } }))).toEqual({
      status: 200,
      body: { eventId: "ev-1", id: "item-9", method: "GET" },
    });
  });

  it("leaves body undefined unless asked to parse it", async () => {
    const route = withCoupleEvent(async ({ body }) => Response.json({ isUndefined: body === undefined }));
    const res = await route(req({ eventId: "ev-1", body: '{"a":1}' }), { params: {} });
    expect((await read(res)).body).toEqual({ isUndefined: true });
  });

  it("parses the JSON body with parseJson", async () => {
    const route = withCoupleEvent(async ({ body }) => Response.json({ got: body.a }), { parseJson: true, fallbackError: "x" });
    expect((await read(await route(req({ eventId: "ev-1", body: '{"a":42}' }), { params: {} }))).body).toEqual({ got: 42 });
  });

  it("reports an invalid body under parseJson through the error path (400, route fallback, not the parser's text)", async () => {
    // SEC-003: the JSON parser's SyntaxError text is internal detail.
    const handler = vi.fn();
    const route = withCoupleEvent(handler, { parseJson: true, fallbackError: "Не успеа." });
    const { status, body } = await read(await route(req({ eventId: "ev-1", body: "{not json" }), { params: {} }));
    expect(status).toBe(400);
    expect(body.error).toBe("Не успеа.");
    expect(handler).not.toHaveBeenCalled();
  });

  it("hides database, storage and runtime errors behind the fallback, but keeps intentional messages (SEC-003)", async () => {
    const pgError = Object.assign(new (class PostgrestError extends Error {})("duplicate key value violates unique constraint \"event_guests_pkey\""), {
      code: "23505",
    });
    const withCode = Object.assign(new Error("relation \"x\" does not exist"), { code: "42P01" });
    for (const err of [pgError, withCode, new TypeError("Cannot read properties of undefined (reading 'id')")]) {
      const route = withCoupleEvent(async () => { throw err; }, { fallbackError: "fb" });
      expect(await read(await route(req({ eventId: "e" }), { params: {} }))).toEqual({ status: 400, body: { error: "fb" } });
    }
    const intentional = withCoupleEvent(async () => { throw new Error("Invitation not found."); }, { fallbackError: "fb" });
    expect(await read(await intentional(req({ eventId: "e" }), { params: {} }))).toEqual({ status: 400, body: { error: "Invitation not found." } });
  });

  it("maps thrown Errors to their message and other throws to the fallback, both 400", async () => {
    const throwsError = withCoupleEvent(async () => { throw new Error("domain failure"); }, { fallbackError: "fb" });
    const throwsString = withCoupleEvent(async () => { throw "weird"; }, { fallbackError: "fb" });
    expect(await read(await throwsError(req({ eventId: "e" }), { params: {} }))).toEqual({ status: 400, body: { error: "domain failure" } });
    expect(await read(await throwsString(req({ eventId: "e" }), { params: {} }))).toEqual({ status: 400, body: { error: "fb" } });
  });

  it("lets errors propagate when no fallbackError is given", async () => {
    const route = withCoupleEvent(async () => { throw new Error("unhandled"); });
    await expect(route(req({ eventId: "e" }), { params: {} })).rejects.toThrow("unhandled");
  });

  it("returns invalidJsonError (400) for a bad body without calling the handler", async () => {
    const handler = vi.fn();
    const route = withCoupleEvent(handler, { invalidJsonError: "Неважечко JSON тело", fallbackError: "fb" });
    expect(await read(await route(req({ eventId: "e", body: "{bad" }), { params: {} }))).toEqual({
      status: 400,
      body: { error: "Неважечко JSON тело" },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("checks the event header before parsing the body", async () => {
    const route = withCoupleEvent(vi.fn(), { invalidJsonError: "bad json" });
    expect((await read(await route(req({ body: "{bad" }), { params: {} }))).status).toBe(401);
  });

  it("passes handler responses through untouched", async () => {
    const route = withCoupleEvent(async () => Response.json({ error: "custom" }, { status: 418 }), { fallbackError: "fb" });
    expect(await read(await route(req({ eventId: "e" }), { params: {} }))).toEqual({ status: 418, body: { error: "custom" } });
  });
});

describe("withPublic", () => {
  it("does not require the event header and passes params and body", async () => {
    const route = withPublic<{ slug: string }>(async ({ params, body }) => Response.json({ slug: params.slug, body }), {
      invalidJsonError: "Invalid JSON body",
    });
    expect(await read(await route(req({ body: '{"x":true}' }), { params: { slug: "abc" } }))).toEqual({
      status: 200,
      body: { slug: "abc", body: { x: true } },
    });
  });

  it("returns invalidJsonError for a bad body", async () => {
    const route = withPublic(vi.fn(), { invalidJsonError: "Invalid JSON body" });
    expect(await read(await route(req({ body: "nope" }), { params: {} }))).toEqual({
      status: 400,
      body: { error: "Invalid JSON body" },
    });
  });

  it("catches errors with fallbackError", async () => {
    const route = withPublic(async () => { throw 1; }, { fallbackError: "Failed." });
    expect(await read(await route(req(), { params: {} }))).toEqual({ status: 400, body: { error: "Failed." } });
  });
});

describe("schema options (SEC-004)", () => {
  const schema = z.object({ n: z.number().max(5) });
  const ID = "3f2b8c1e-9a4d-4c2e-8f1a-2b3c4d5e6f70";

  it("hands the handler the parsed body with unknown keys stripped", async () => {
    const route = withCoupleEvent(async ({ body }) => Response.json(body), { body: schema, fallbackError: "fb" });
    expect(await read(await route(req({ eventId: "e", body: '{"n":1,"x":2}' }), { params: {} }))).toEqual({
      status: 200,
      body: { n: 1 },
    });
  });

  it("rejects an invalid body with the default or the route's message, without calling the handler", async () => {
    const handler = vi.fn();
    const route = withCoupleEvent(handler, { body: schema, fallbackError: "fb" });
    expect(await read(await route(req({ eventId: "e", body: '{"n":9}' }), { params: {} }))).toEqual({
      status: 400,
      body: { error: "Неважечки податоци." },
    });
    const custom = withCoupleEvent(handler, { body: schema, invalidBodyError: "custom", fallbackError: "fb" });
    expect((await read(await custom(req({ eventId: "e", body: '{"n":"1"}' }), { params: {} }))).body).toEqual({
      error: "custom",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("validates params before reading the body", async () => {
    const handler = vi.fn();
    const route = withCoupleEvent(handler, { params: z.object({ id: z.string().uuid() }), body: schema });
    expect(await read(await route(req({ eventId: "e", body: "{bad" }), { params: { id: "nope" } as never }))).toEqual({
      status: 400,
      body: { error: "Неважечки идентификатор." },
    });
    const ok = withCoupleEvent(async ({ params }) => Response.json(params), { params: z.object({ id: z.string() }) });
    expect((await read(await ok(req({ eventId: "e" }), { params: { id: ID } }))).body).toEqual({ id: ID });
    expect(handler).not.toHaveBeenCalled();
  });
});
