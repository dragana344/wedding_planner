import { describe, it, expect, vi, beforeEach } from "vitest";

// The browser helpers behind event menus: creating an event (with its custom
// menu), the custom-menu calls, guests' menu usage and the Видено on menu
// numbers. A 403 drops the manager login — except a locked plan feature,
// which is also a 403 but leaves the login valid.

const rejected = vi.hoisted(() => vi.fn());
vi.mock("@/components/venue/shell/ManagerElevationContext", () => ({ reportElevationRejected: rejected }));

import { LOCKED_MESSAGE } from "@/lib/entitlements/features";
import {
  createEventViaApi,
  deleteEventViaApi,
  fetchNewEventCustomMenuEnabled,
  regenerateEventPasswordViaApi,
  updateEventContactInfoViaApi,
  updateEventFinanceViaApi,
  updateEventViaApi,
} from "@/lib/venue/events-client";
import {
  copyCustomMenuViaApi,
  deleteCustomMenuViaApi,
  fetchCustomMenuEnabled,
  saveCustomMenuViaApi,
} from "@/lib/venue/custom-menu-client";
import { fetchMenuUsage } from "@/lib/venue/menu-usage-client";
import { markMenuNumbersSeenViaApi, NewerMenuNumbersError } from "@/lib/venue/menu-numbers-client";

const mockFetch = vi.fn();
function respond(status: number, body: unknown) {
  mockFetch.mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body });
}
beforeEach(() => {
  rejected.mockReset();
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

const newEvent = {
  venue_id: "v1",
  couple_names: "Ана и Петар",
  event_date: "2027-10-01",
  room_ids: [],
  menu_template_ids: ["m1"],
  contacts: { contact_email: "a@example.com", contact_phone: "070 123 456" },
  credentials: { username: "ana-petar", password: "a-strong-password" },
};

describe("events-client", () => {
  it("creates the event with its custom menu in one request, with the manager token", async () => {
    respond(200, { id: "e1" });
    const input = { ...newEvent, custom_menu: { name: "Мени на парот", item_ids: ["d1"] } };
    await expect(createEventViaApi(input, "tok")).resolves.toEqual({ id: "e1" });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/venue/events");
    expect(init.method).toBe("POST");
    expect(init.headers["x-venue-manager-token"]).toBe("tok");
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it("a locked plan refuses the create but keeps the manager login", async () => {
    respond(403, { error: LOCKED_MESSAGE });
    await expect(createEventViaApi(newEvent, "tok")).rejects.toThrow(LOCKED_MESSAGE);
    expect(rejected).not.toHaveBeenCalled();
  });

  it.each([
    ["update", () => updateEventViaApi("e1", {} as never, "tok"), "/api/venue/events/e1", "PATCH"],
    ["delete", () => deleteEventViaApi("e1", "tok"), "/api/venue/events/e1", "DELETE"],
    ["contact", () => updateEventContactInfoViaApi("e1", {} as never, "tok"), "/api/venue/events/e1/contact", "PATCH"],
    ["finance", () => updateEventFinanceViaApi("e1", {} as never, "tok"), "/api/venue/events/e1/finance", "PATCH"],
    ["password", () => regenerateEventPasswordViaApi("e1", "pw", "tok"), "/api/venue/events/e1/regenerate-password", "POST"],
  ])("%s: a refused manager login is reported", async (_name, call, url, method) => {
    respond(403, { error: "Потребна е најава како менаџер." });
    await expect(call()).rejects.toThrow("Потребна е најава како менаџер.");
    expect(mockFetch.mock.calls[0][0]).toBe(url);
    expect(mockFetch.mock.calls[0][1].method).toBe(method);
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it("the new-event form learns whether the plan has the custom menu; a failure counts as enabled", async () => {
    respond(200, { customMenuEnabled: false });
    await expect(fetchNewEventCustomMenuEnabled("tok")).resolves.toBe(false);
    expect(mockFetch.mock.calls[0][1].headers["x-venue-manager-token"]).toBe("tok");
    respond(200, { customMenuEnabled: true });
    await expect(fetchNewEventCustomMenuEnabled(null)).resolves.toBe(true);
    respond(500, {});
    await expect(fetchNewEventCustomMenuEnabled("tok")).resolves.toBe(true);
    mockFetch.mockRejectedValue(new Error("offline"));
    await expect(fetchNewEventCustomMenuEnabled("tok")).resolves.toBe(true);
  });
});

describe("custom-menu-client", () => {
  it("saves the event's custom menu", async () => {
    respond(200, { id: "c1" });
    await expect(saveCustomMenuViaApi("e1", { name: "Мени", itemIds: ["d1"] }, "tok")).resolves.toEqual({ id: "c1" });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("/api/venue/events/e1/custom-menu");
    expect(JSON.parse(init.body)).toEqual({ name: "Мени", item_ids: ["d1"] });
  });

  it("locked keeps the login; a refused login is reported", async () => {
    respond(403, { error: LOCKED_MESSAGE });
    await expect(saveCustomMenuViaApi("e1", { name: "М", itemIds: [] }, "tok")).rejects.toThrow(LOCKED_MESSAGE);
    expect(rejected).not.toHaveBeenCalled();
    respond(403, { error: "Потребна е најава како менаџер." });
    await expect(deleteCustomMenuViaApi("c1", "tok")).rejects.toThrow("Потребна е најава како менаџер.");
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it("deletes and copies a past custom menu", async () => {
    respond(200, { ok: true });
    await deleteCustomMenuViaApi("c1", "tok");
    expect(mockFetch.mock.calls[0][0]).toBe("/api/venue/menus/custom/c1");
    expect(mockFetch.mock.calls[0][1].method).toBe("DELETE");
    respond(200, { id: "p9" });
    await expect(copyCustomMenuViaApi("c1", "tok")).resolves.toEqual({ id: "p9" });
    expect(mockFetch.mock.calls[1][0]).toBe("/api/venue/menus/custom/c1/copy");
    respond(500, null);
    await expect(copyCustomMenuViaApi("c1", "tok")).rejects.toThrow("Не успеа создавањето на пакетот.");
  });

  it("whether the event's plan has the custom menu; a failure counts as enabled", async () => {
    respond(200, { enabled: false });
    await expect(fetchCustomMenuEnabled("e1", "tok")).resolves.toBe(false);
    respond(500, {});
    await expect(fetchCustomMenuEnabled("e1", "tok")).resolves.toBe(true);
  });
});

describe("menu usage and Видено", () => {
  it("reads how many guests picked each menu", async () => {
    respond(200, { usage: { m1: 3 } });
    await expect(fetchMenuUsage("e1", "tok")).resolves.toEqual({ m1: 3 });
    respond(200, {});
    await expect(fetchMenuUsage("e1", "tok")).resolves.toEqual({});
    respond(403, {});
    await expect(fetchMenuUsage("e1", "tok")).rejects.toThrow("Не успеа проверката на изборот на гостите.");
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it("Видено sends the submission it saw; newer numbers are a distinct error", async () => {
    respond(200, { ok: true });
    await markMenuNumbersSeenViaApi("e1", "s1", "tok");
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ submission_id: "s1" });
    respond(409, { error: "Парот испрати нови бројки — освежете." });
    await expect(markMenuNumbersSeenViaApi("e1", "s1", "tok")).rejects.toBeInstanceOf(NewerMenuNumbersError);
    respond(403, {});
    await expect(markMenuNumbersSeenViaApi("e1", "s1", "tok")).rejects.toThrow("Не успеа означувањето како видено.");
    expect(rejected).toHaveBeenCalledTimes(1);
  });
});
