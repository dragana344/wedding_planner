// @vitest-environment node
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware, isCrossOriginMutation } from "@/middleware";

function req(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method: init.method ?? "GET",
    headers: { host: "localhost:3000", ...init.headers },
  });
}

describe("CSRF origin check (SEC-015)", () => {
  it("refuses a cross-origin POST to a couple route before any session lookup", async () => {
    const res = await middleware(
      req("/api/couple/notes", {
        method: "POST",
        headers: { origin: "https://evil.example", cookie: "couple_session=anything" },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("refuses a cross-origin DELETE to a venue route", async () => {
    const res = await middleware(req("/api/venue/signup", { method: "DELETE", headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
  });

  it("refuses an opaque 'null' origin and a foreign referer", () => {
    expect(isCrossOriginMutation(req("/api/couple/notes", { method: "POST", headers: { origin: "null" } }))).toBe(true);
    expect(
      isCrossOriginMutation(req("/api/couple/notes", { method: "PATCH", headers: { referer: "https://evil.example/page" } })),
    ).toBe(true);
  });

  it("lets same-origin mutations and all safe methods through", () => {
    expect(isCrossOriginMutation(req("/api/couple/notes", { method: "POST", headers: { origin: "http://localhost:3000" } }))).toBe(false);
    expect(isCrossOriginMutation(req("/api/couple/notes", { method: "GET", headers: { origin: "https://evil.example" } }))).toBe(false);
  });

  it("uses x-forwarded-host when the platform proxy sets it", () => {
    const r = req("/api/venue/contact", {
      method: "POST",
      headers: { origin: "https://app.example.mk", "x-forwarded-host": "app.example.mk" },
    });
    expect(isCrossOriginMutation(r)).toBe(false);
  });

  it("does not block a same-origin public POST", async () => {
    const res = await middleware(req("/api/venue/contact", { method: "POST", headers: { origin: "http://localhost:3000" } }));
    expect(res.status).toBe(200);
  });
});

describe("venue session gate (AUTH-001)", () => {
  it("redirects an unauthenticated /venue page request to /login", async () => {
    const res = await middleware(req("/venue/calendar"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("does not redirect venue API routes (they answer with their own 401)", async () => {
    const res = await middleware(req("/api/venue/signup", { method: "POST" }));
    expect(res.status).toBe(200);
  });
});

describe("request ids (OBS-002)", () => {
  it("forwards a fresh request id to the route and echoes it on the response, ignoring a client-supplied one", async () => {
    const res = await middleware(req("/api/venue/contact", { method: "POST", headers: { "x-request-id": "forged" } }));
    const id = res.headers.get("x-request-id");
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("x-middleware-request-x-request-id")).toBe(id);
  });

  it("tags refused requests too", async () => {
    const res = await middleware(req("/api/couple/notes", { method: "POST", headers: { origin: "https://evil.example" } }));
    expect(res.status).toBe(403);
    expect(res.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
