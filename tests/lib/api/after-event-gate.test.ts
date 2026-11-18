// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

const has = vi.hoisted(() => ({ eventHasFeature: vi.fn(async () => true) }));
vi.mock("@/lib/entitlements/server", () => has);

import { withCoupleEvent } from "@/lib/api/handler";

// Group A task 2: after the event the couple's panel is read-only. proxy.ts
// puts the phase on the request; withCoupleEvent refuses every write unless
// the route opts in with `allowAfterEvent`.

const READ_ONLY = "Настанот заврши — податоците се само за преглед и преземање.";

function req(method: string, phase?: string) {
  const headers: Record<string, string> = { "x-couple-event-id": "e1", "content-type": "application/json" };
  if (phase) headers["x-couple-access-phase"] = phase;
  return new NextRequest("http://localhost/api/couple/notes", {
    method,
    headers,
    body: method === "GET" || method === "DELETE" ? undefined : "{}",
  });
}

const handler = vi.fn(async () => NextResponse.json({ ok: true }));
beforeEach(() => handler.mockClear());

describe("read-only period after the event (withCoupleEvent)", () => {
  const route = withCoupleEvent(handler, { fallbackError: "fb" });

  it("refuses POST/PUT/PATCH/DELETE in the memories phase with 403 and the read-only message", async () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await route(req(m, "memories"), { params: {} });
      expect(res.status, m).toBe(403);
      expect(await res.json()).toEqual({ error: READ_ONLY });
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("still serves GET in the memories phase (viewing and downloads)", async () => {
    expect((await route(req("GET", "memories"), { params: {} })).status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("lets every write through while the event is active (or without a phase header)", async () => {
    for (const m of ["POST", "PATCH", "DELETE"]) {
      expect((await route(req(m, "active"), { params: {} })).status, m).toBe(200);
      expect((await route(req(m), { params: {} })).status, m).toBe(200);
    }
  });

  it("lets an allow-listed route write in the memories phase", async () => {
    const allowed = withCoupleEvent(handler, { allowAfterEvent: true, fallbackError: "fb" });
    expect((await allowed(req("POST", "memories"), { params: {} })).status).toBe(200);
    expect((await allowed(req("DELETE", "memories"), { params: {} })).status).toBe(200);
  });

  it("an allow-listed route still answers to its feature gate", async () => {
    has.eventHasFeature.mockResolvedValueOnce(false);
    const gated = withCoupleEvent(handler, { allowAfterEvent: true, feature: "photo_album", fallbackError: "fb" });
    expect((await gated(req("PATCH", "memories"), { params: {} })).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

// The writes that stay open after the event. Anything else needs a reason here.
const ALLOWED_AFTER_EVENT: Record<string, string> = {
  "app/api/couple/support/route.ts": "reporting a problem",
  "app/api/couple/support/[id]/route.ts": "replying in a support conversation",
  "app/api/couple/album/photos/[id]/route.ts": "hiding/deleting a guest's photo (2 handlers)",
  "app/api/couple/greetings/[id]/route.ts": "deleting a guest's greeting",
  "app/api/couple/changes/seen/route.ts": "a read marker the screens send on their own",
};

describe("after-event allow-list", () => {
  it("only the listed couple routes declare allowAfterEvent", () => {
    const files = (readdirSync("app/api/couple", { recursive: true }) as string[])
      .filter((f) => path.basename(f) === "route.ts")
      .map((f) => path.posix.join("app/api/couple", f.split(path.sep).join("/")));
    const declaring = files.filter((f) => readFileSync(f, "utf8").includes("allowAfterEvent: true")).sort();
    expect(declaring).toEqual(Object.keys(ALLOWED_AFTER_EVENT).sort());
  });

  it("the greetings route allows deleting only, not hiding", () => {
    const source = readFileSync("app/api/couple/greetings/[id]/route.ts", "utf8");
    expect(source.match(/allowAfterEvent: true/g)).toHaveLength(1);
    expect(source.indexOf("allowAfterEvent")).toBeGreaterThan(source.indexOf("export const DELETE"));
  });
});
