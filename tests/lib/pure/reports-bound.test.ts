import { describe, it, expect, vi, afterEach } from "vitest";
import { getReport } from "@/lib/venue/reports";
import * as logModule from "@/lib/log";

// The report query silently capped at 5000 events with no trace (final
// review finding) — same reasoning as lib/list-bound.ts's MAX_LIST_ROWS,
// just logged instead of thrown, since an incomplete report is not an
// error a venue needs to see, but is one worth someone noticing.

function stubClient(rows: unknown[]) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  };
  return { from: () => chain } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

function row(id: string) {
  return { id, event_date: "2027-01-01", event_type: "wedding", status: "confirmed", guest_count_estimate: 10, total_price: null, deposit_paid: null, event_rooms: [] };
}

describe("getReport — event bound", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs a warning when the 5000-event cap is reached", async () => {
    const logSpy = vi.spyOn(logModule, "log").mockImplementation(() => {});
    const rows = Array.from({ length: 5000 }, (_, i) => row(`e${i}`));
    await getReport(stubClient(rows), "v1", {});
    expect(logSpy).toHaveBeenCalledWith("warn", "report_event_bound_reached", { venue_id: "v1", max: 5000 });
  });

  it("does not warn when under the cap", async () => {
    const logSpy = vi.spyOn(logModule, "log").mockImplementation(() => {});
    await getReport(stubClient([row("e1")]), "v1", {});
    expect(logSpy).not.toHaveBeenCalled();
  });
});
