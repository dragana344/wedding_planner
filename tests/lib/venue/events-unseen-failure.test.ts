import { describe, it, expect, vi } from "vitest";
import { listEventsWithDetails } from "@/lib/venue/events";

vi.mock("@/lib/log", async (orig) => ({ ...(await orig<object>()), log: vi.fn() }));

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit"]) q[m] = () => q;
  q.then = (res: (v: unknown) => unknown) => res(result);
  return q;
}

describe("listEventsWithDetails when the unseen-changes RPC fails", () => {
  it("still lists events, with no unseen sections", async () => {
    const row = { id: "e1", couple_names: "Ана", event_date: "2030-01-01", status: "confirmed", event_type: "wedding", seating_unseen_at: null };
    const client = {
      from: () => chain({ data: [row], error: null }),
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    };
    const list = await listEventsWithDetails("v1", client as never);
    expect(list).toHaveLength(1);
    expect(list[0].unseenSections).toEqual([]);
  });
});
