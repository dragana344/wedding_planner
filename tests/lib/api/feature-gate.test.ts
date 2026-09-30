// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
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

// Couple routes whose writes are core to every package, so they take no
// `feature` gate. Everything else under app/api/couple must declare one.
const UNGATED: Record<string, string> = {
  "app/api/couple/login/route.ts": "signing in is needed to reach any feature",
  "app/api/couple/logout/route.ts": "signing out must always work",
  "app/api/couple/guests/route.ts": "the guest list is core; its size is limited by max_guests (0049 trigger)",
  "app/api/couple/guests/[id]/route.ts": "editing a guest is core guest-list management",
  "app/api/couple/guests/import/route.ts": "bulk add of the core guest list; max_guests trigger refuses over the limit",
  "app/api/couple/contact-info/route.ts": "the couple's own contact details, core account data",
  "app/api/couple/guest-count/route.ts": "the headcount the venue plans with, core to every event",
  "app/api/couple/menu/route.ts": "choosing a template menu is core; the custom mode checks custom_menu inside the handler",
  "app/api/couple/menu/quantities/route.ts": "per-dish counts for the venue's kitchen, core to every event",
};

function coupleRoutes(): string[] {
  return (readdirSync("app/api/couple", { recursive: true }) as string[])
    .filter((f) => path.basename(f) === "route.ts")
    .map((f) => path.posix.join("app/api/couple", f.split(path.sep).join("/")))
    .sort();
}

describe("feature gate coverage (every couple write is gated or listed)", () => {
  it("finds the couple routes", () => {
    expect(coupleRoutes().length).toBeGreaterThan(30);
  });

  it("every POST/PUT/PATCH couple route declares a feature or is explicitly ungated", () => {
    const missing: string[] = [];
    for (const file of coupleRoutes()) {
      const source = readFileSync(file, "utf8");
      const writes = (source.match(/export (const|async function) (POST|PUT|PATCH)\b/g) ?? []).length;
      if (writes === 0 || UNGATED[file]) continue;
      // One `feature:` per write handler, so a second handler added to a gated file can't slip through.
      const gates = (source.match(/feature: "/g) ?? []).length;
      if (gates < writes) missing.push(`${file} (${gates} gates for ${writes} write handlers)`);
    }
    expect(missing).toEqual([]);
  });

  it("every UNGATED entry exists, has writes, has a reason and declares no feature", () => {
    for (const [file, reason] of Object.entries(UNGATED)) {
      const source = readFileSync(file, "utf8");
      expect(reason.length, file).toBeGreaterThan(10);
      expect(/export (const|async function) (POST|PUT|PATCH)\b/.test(source), file).toBe(true);
      expect(source, file).not.toContain('feature: "');
    }
  });

  it("the Session 1 follow-up routes carry the right feature", () => {
    const expected: Record<string, string> = {
      "app/api/couple/seating/group/route.ts": "seating", "app/api/couple/seating/redo/route.ts": "seating",
      "app/api/couple/seating/seats/route.ts": "seating", "app/api/couple/seating/history/route.ts": "seating",
      "app/api/couple/guests/[id]/seat/route.ts": "seating",
      "app/api/couple/co-organizers/route.ts": "co_organizers", "app/api/couple/co-organizers/[id]/route.ts": "co_organizers",
      "app/api/couple/reminder/route.ts": "reminders",
      "app/api/couple/guests/email/route.ts": "personal_invite_links", "app/api/couple/guests/sent/route.ts": "personal_invite_links",
      "app/api/couple/album/photos/route.ts": "photo_album", "app/api/couple/album/photos/[id]/route.ts": "photo_album",
      "app/api/couple/album/zip/route.ts": "photo_album", "app/api/couple/greetings/[id]/route.ts": "guest_greetings",
    };
    for (const [file, key] of Object.entries(expected)) {
      expect(readFileSync(file, "utf8"), file).toContain(`feature: "${key}"`);
    }
  });
});
