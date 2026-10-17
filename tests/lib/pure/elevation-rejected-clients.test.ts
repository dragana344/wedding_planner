import { describe, it, expect, vi, beforeEach } from "vitest";

// A 403 from any gated venue route means the manager login is no longer
// valid server-side: every browser helper must report it so the stale
// "Менаџер: X" badge and manager-only controls clear (review item #5).

const rejected = vi.hoisted(() => vi.fn());
vi.mock("@/components/venue/shell/ManagerElevationContext", () => ({ reportElevationRejected: rejected }));
vi.mock("@/lib/supabase/resolve-client", () => ({ resolveSupabaseClient: () => ({}) }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => ({}) }));

import { venueSeatingClientActions } from "@/lib/venue/seating-client";
import { saveVenueName } from "@/lib/venue/settings-client";
import { deleteShowcasePhotoViaApi, addShowcasePhotoViaApi } from "@/lib/venue/showcase-client";

const mockFetch = vi.fn();
beforeEach(() => {
  rejected.mockReset();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "Потребна е најава како менаџер." }) });
  vi.stubGlobal("fetch", mockFetch);
});

describe("venue browser helpers report a refused manager login", () => {
  it.each([
    ["seating", () => venueSeatingClientActions("e1", "dead-token").undo("e1", "r1")],
    ["settings", () => saveVenueName("Нов", "dead-token")],
    ["showcase delete", () => deleteShowcasePhotoViaApi("e1", "p1", "dead-token")],
    ["showcase upload", () => addShowcasePhotoViaApi("e1", new File(["x"], "a.png"), "dead-token")],
  ])("%s", async (_name, call) => {
    await expect(call()).rejects.toThrow("Потребна е најава како менаџер.");
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  it("does not drop the login for other errors", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Нема што да се врати." }) });
    await expect(venueSeatingClientActions("e1", "token").undo("e1", "r1")).rejects.toThrow("Нема што да се врати.");
    expect(rejected).not.toHaveBeenCalled();
  });
});
