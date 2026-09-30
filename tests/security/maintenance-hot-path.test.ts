// @vitest-environment node
//
// Controller ruling (task 4.1 review): proxy.ts is a hot path and must
// never *await* the maintenance flag's own database call — it only reads
// the synchronous in-memory cache and starts a background refresh it never
// waits on. This file proves that contract by mocking the refresh function
// to hang forever and asserting proxy() still resolves promptly.
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";

let refreshCalls = 0;

vi.mock("@/lib/platform-settings", () => ({
  peekMaintenanceMode: () => false,
  // Stale/cold on every check, so proxy() always tries to kick off a
  // refresh — this is the scenario that must never block the response.
  isMaintenanceModeStale: () => true,
  refreshMaintenanceMode: () => {
    refreshCalls++;
    return new Promise<boolean>(() => {
      /* never resolves */
    });
  },
  invalidateMaintenanceCache: () => {},
}));

import { proxy } from "@/proxy";

function req(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers: { host: "localhost:3000" } });
}

describe("maintenance hot path never awaits the background refresh", () => {
  it("resolves promptly (well under the DB's own 1.5s timeout) even when the refresh hangs forever", async () => {
    const started = Date.now();
    const res = await proxy(req("/"));
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(200);
    expect(res.status).toBe(200);
    expect(refreshCalls).toBeGreaterThan(0);
  });

  it("still resolves promptly with no event/waitUntil at all (a plain unit-test call, no runtime)", async () => {
    const started = Date.now();
    const res = await proxy(req("/api/health"));
    expect(Date.now() - started).toBeLessThan(200);
    expect(res.status).toBe(200);
  });
});
