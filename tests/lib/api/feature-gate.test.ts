// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { NextRequest, NextResponse } from "next/server";

const has = vi.hoisted(() => ({ eventHasFeature: vi.fn() }));
vi.mock("@/lib/entitlements/server", () => has);

import { withCoupleEvent } from "@/lib/api/handler";

function req(method: string) {
  return new NextRequest("http://localhost/api/couple/budget", {
    method,
    headers: { "x-couple-event-id": "e1", "content-type": "application/json" },
    body: method === "GET" || method === "DELETE" ? undefined : "{}",
  });
}

beforeEach(() => has.eventHasFeature.mockReset());

describe("feature gate (spec §4.4)", () => {
  const handler = vi.fn(async () => NextResponse.json({ ok: true }));
  const route = withCoupleEvent(handler, { feature: "budget", fallbackError: "fb" });

  it("refuses POST/PUT/PATCH on a locked feature with 403 and the locked message", async () => {
    has.eventHasFeature.mockResolvedValue(false);
    for (const m of ["POST", "PUT", "PATCH"]) {
      const res = await route(req(m), { params: {} });
      expect(res.status, m).toBe(403);
      expect(await res.json()).toEqual({ error: "Оваа функција не е вклучена во вашиот пакет." });
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets GET and DELETE through on a locked feature (D7)", async () => {
    has.eventHasFeature.mockResolvedValue(false);
    expect((await route(req("GET"), { params: {} })).status).toBe(200);
    expect((await route(req("DELETE"), { params: {} })).status).toBe(200);
    expect(has.eventHasFeature).not.toHaveBeenCalled();
  });

  it("runs the handler when the feature is enabled", async () => {
    has.eventHasFeature.mockResolvedValue(true);
    expect((await route(req("POST"), { params: {} })).status).toBe(200);
    expect(has.eventHasFeature).toHaveBeenCalledWith("e1", "budget");
  });

  it("every gated couple route declares its feature", () => {
    const expected: Record<string, string> = {
      "app/api/couple/agenda/route.ts": "agenda", "app/api/couple/agenda/[id]/route.ts": "agenda",
      "app/api/couple/budget/route.ts": "budget", "app/api/couple/budget/[id]/route.ts": "budget",
      "app/api/couple/checklist/route.ts": "checklist", "app/api/couple/checklist/[id]/route.ts": "checklist",
      "app/api/couple/checklist/[id]/subtasks/route.ts": "checklist", "app/api/couple/checklist/[id]/subtasks/[subtaskId]/route.ts": "checklist",
      "app/api/couple/locations/route.ts": "locations", "app/api/couple/locations/[id]/route.ts": "locations",
      "app/api/couple/notes/route.ts": "notes", "app/api/couple/notes/[id]/route.ts": "notes",
      "app/api/couple/seating/confirm/route.ts": "seating", "app/api/couple/seating/elements/route.ts": "seating",
      "app/api/couple/seating/elements/[id]/route.ts": "seating", "app/api/couple/seating/revert/route.ts": "seating",
      "app/api/couple/seating/undo/route.ts": "seating", "app/api/couple/invitation/route.ts": "invitation",
      "app/api/couple/invitation/photo/route.ts": "invitation_photo", "app/api/couple/invitation/photo/confirm/route.ts": "invitation_photo",
    };
    for (const [file, key] of Object.entries(expected)) {
      expect(readFileSync(file, "utf8"), file).toContain(`feature: "${key}"`);
    }
  });
});
