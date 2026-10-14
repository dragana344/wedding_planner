import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/admin/guard", () => ({ requireAdmin: vi.fn(async () => ({ adminUserId: "a", requestId: null })) }));

const PAST_ID = "11111111-1111-1111-1111-111111111111";
const FUTURE_ID = "22222222-2222-2222-2222-222222222222";

vi.mock("@/lib/admin/queries", () => ({
  listEvents: vi.fn(async () => [
    { id: PAST_ID, venueId: "v1", venueName: "Сала Езеро", date: "2000-01-01", startTime: null, endTime: null, coupleNames: "Пар Минато", status: "completed", type: null, guestEstimate: null },
    { id: FUTURE_ID, venueId: "v1", venueName: "Сала Езеро", date: "2999-01-01", startTime: null, endTime: null, coupleNames: "Пар Иднина", status: "confirmed", type: null, guestEstimate: null },
  ]),
  listVenues: vi.fn(async () => []),
}));

import EventsPage from "@/app/admin/(panel)/events/page";

describe("admin EventsPage", () => {
  it("marks a past event's row as row-past, and leaves a future event's row unmarked", async () => {
    render(await EventsPage({ searchParams: Promise.resolve({}) }));
    const pastRow = screen.getByText("Пар Минато").closest("tr")!;
    const futureRow = screen.getByText("Пар Иднина").closest("tr")!;
    expect(pastRow).toHaveClass("row-past");
    expect(futureRow).not.toHaveClass("row-past");
  });
});
