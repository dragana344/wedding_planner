// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Group A task 2: proxy.ts turns the couple's access phase into a request
// header (never trusted from the browser) and explains a closed event.

vi.mock("@/lib/platform-settings", () => ({
  peekMaintenanceMode: () => false,
  isMaintenanceModeStale: () => false,
  refreshMaintenanceMode: async () => false,
  invalidateMaintenanceCache: () => {},
}));
const sessions = vi.hoisted(() => ({ checkCoupleSession: vi.fn(), validateAndRenewCoupleSession: vi.fn(async () => null) }));
vi.mock("@/lib/couple/session-verify", () => ({ ...sessions, COUPLE_ORGANIZER_SIDE_HEADER: "x-couple-organizer-side" }));

import { proxy } from "@/proxy";

function req(path: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: { host: "localhost:3000", cookie: "couple_session=tok", ...headers },
  });
}

beforeEach(() => sessions.checkCoupleSession.mockReset());

describe("couple access phase in proxy.ts", () => {
  it("forwards the session's phase and drops one sent by the browser", async () => {
    sessions.checkCoupleSession.mockResolvedValue({ session: { eventId: "e1", organizerSide: null, phase: "active" } });
    const res = await proxy(req("/api/couple/notes", { "x-couple-access-phase": "memories" }));
    expect(res.headers.get("x-middleware-request-x-couple-access-phase")).toBe("active");

    sessions.checkCoupleSession.mockResolvedValue({ session: { eventId: "e1", organizerSide: null, phase: "memories" } });
    const after = await proxy(req("/couple/budget"));
    expect(after.headers.get("x-middleware-request-x-couple-access-phase")).toBe("memories");
  });

  it("sends a closed event's page request to the login with the reason", async () => {
    sessions.checkCoupleSession.mockResolvedValue({ closed: true });
    const res = await proxy(req("/couple/budget"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search).toBe("/couple/login?reason=closed");
  });

  it("answers a closed event's API request with 401 and the message", async () => {
    sessions.checkCoupleSession.mockResolvedValue({ closed: true });
    const res = await proxy(req("/api/couple/notes"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Пристапот до овој настан заврши. За прашања контактирајте го локалот." });
  });

  it("keeps the plain redirect for a missing or expired session", async () => {
    sessions.checkCoupleSession.mockResolvedValue(null);
    const res = await proxy(req("/couple/budget"));
    expect(new URL(res.headers.get("location")!).search).toBe("");
  });
});
