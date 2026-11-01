import { describe, it, expect, vi, beforeEach } from "vitest";

// The browser helpers behind the venue's change marks. A 403 drops the manager
// login, except a locked plan feature, which is also a 403 but leaves it valid.

const rejected = vi.hoisted(() => vi.fn());
vi.mock("@/components/venue/shell/ManagerElevationContext", () => ({ reportElevationRejected: rejected }));

import { LOCKED_MESSAGE } from "@/lib/entitlements/features";
import { enterMenuNumbersViaApi, fetchEventChanges, markChangesSeenViaApi, remindCoupleViaApi } from "@/lib/venue/changes-client";

const mockFetch = vi.fn();
function respond(status: number, body: unknown) {
  mockFetch.mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
}
beforeEach(() => {
  rejected.mockReset();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

describe("fetchEventChanges", () => {
  it("GETs with the manager token and returns the data", async () => {
    const data = { changes: [], seen: {}, lastReminderAt: null };
    respond(200, data);
    expect(await fetchEventChanges("e1", "tok")).toEqual(data);
    expect(mockFetch).toHaveBeenCalledWith("/api/venue/events/e1/changes", { headers: { "x-venue-manager-token": "tok" } });
  });

  it("sends no token header without one", async () => {
    respond(200, { changes: [], seen: {}, lastReminderAt: null });
    await fetchEventChanges("e1", null);
    expect(mockFetch.mock.calls[0][1]).toEqual({ headers: {} });
  });

  it("throws on failure", async () => {
    respond(500, { error: "x" });
    await expect(fetchEventChanges("e1", null)).rejects.toThrow();
  });
});

describe("markChangesSeenViaApi", () => {
  it("posts the section and position and returns newer", async () => {
    respond(200, { ok: true, newer: true });
    expect(await markChangesSeenViaApi("e1", "contact", "2030-01-01T00:00:00.123456Z", "tok")).toEqual({ newer: true });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/venue/events/e1/changes/seen");
    expect(JSON.parse(init.body)).toEqual({ section: "contact", up_to: "2030-01-01T00:00:00.123456Z" });
    expect(init.headers["x-venue-manager-token"]).toBe("tok");
  });

  it("newer is false when the server does not say so", async () => {
    respond(200, { ok: true });
    expect(await markChangesSeenViaApi("e1", "guest_count", "t", "tok")).toEqual({ newer: false });
  });

  it("a 403 reports the rejected elevation", async () => {
    respond(403, { error: "x" });
    await expect(markChangesSeenViaApi("e1", "contact", "t", "tok")).rejects.toThrow();
    expect(rejected).toHaveBeenCalledTimes(1);
  });
});

describe("remindCoupleViaApi", () => {
  it("returns remindedAt", async () => {
    respond(200, { remindedAt: "2030-01-01T10:00:00Z" });
    expect(await remindCoupleViaApi("e1", "tok")).toEqual({ remindedAt: "2030-01-01T10:00:00Z" });
    expect(mockFetch.mock.calls[0][0]).toBe("/api/venue/events/e1/remind-couple");
  });

  it("surfaces the server's message on 429 without dropping the login", async () => {
    respond(429, { error: "Веќе потсетивте денес." });
    await expect(remindCoupleViaApi("e1", "tok")).rejects.toThrow("Веќе потсетивте денес.");
    expect(rejected).not.toHaveBeenCalled();
  });

  it("a 403 reports the rejected elevation", async () => {
    respond(403, { error: "x" });
    await expect(remindCoupleViaApi("e1", "tok")).rejects.toThrow();
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it("a locked 403 leaves the login alone", async () => {
    respond(403, { error: LOCKED_MESSAGE });
    await expect(remindCoupleViaApi("e1", "tok")).rejects.toThrow(LOCKED_MESSAGE);
    expect(rejected).not.toHaveBeenCalled();
  });
});

describe("enterMenuNumbersViaApi", () => {
  it("posts the counts", async () => {
    respond(200, { ok: true });
    await enterMenuNumbersViaApi("e1", { m1: 3 }, "tok");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/venue/events/e1/menu-numbers");
    expect(JSON.parse(init.body)).toEqual({ counts: { m1: 3 } });
  });

  it("surfaces the server's message on 400 and 409", async () => {
    respond(400, { error: "Непознато мени." });
    await expect(enterMenuNumbersViaApi("e1", {}, "tok")).rejects.toThrow("Непознато мени.");
    respond(409, { error: "Настанот е во минатото." });
    await expect(enterMenuNumbersViaApi("e1", {}, "tok")).rejects.toThrow("Настанот е во минатото.");
    expect(rejected).not.toHaveBeenCalled();
  });

  it("a 403 reports the rejected elevation", async () => {
    respond(403, { error: "x" });
    await expect(enterMenuNumbersViaApi("e1", {}, "tok")).rejects.toThrow();
    expect(rejected).toHaveBeenCalledTimes(1);
  });
});
