import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { WeekCalendarClient } from "@/components/venue/dashboard/WeekCalendarClient";
import type { EventDetail } from "@/lib/venue/events";

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function baseEvent(overrides: Partial<EventDetail>): EventDetail {
  return {
    id: "e1",
    couple_names: "Ана и Петар",
    event_date: isoToday(),
    start_time: null,
    end_time: null,
    status: "confirmed",
    event_type: "wedding",
    guest_count_estimate: null,
    created_at: "2026-01-01T10:00:00Z",
    menus: [],
    room_ids: [],
    hasShowcasePhotos: false,
    seatedCount: 0,
    contact_email: null,
    contact_email_2: null,
    contact_phone: null,
    total_price: null,
    deposit_paid: null,
    hasUnseenSeatingChange: false,
    unseenSections: [],
    menuNumbers: { latest: null, previous: null },
    ...overrides,
  };
}

describe("WeekCalendarClient — overnight events", () => {
  it("shows hour labels wrapping past midnight (grid runs 07:00 to 03:00 the next day)", () => {
    render(<WeekCalendarClient rooms={[]} events={[]} totalCapacity={0} />);
    expect(screen.getByText("07:00")).toBeInTheDocument();
    expect(screen.getByText("23:00")).toBeInTheDocument();
    // Hours after midnight wrap to 00/01/02, not 24/25/26.
    expect(screen.getByText("00:00")).toBeInTheDocument();
    expect(screen.getByText("02:00")).toBeInTheDocument();
  });

  it("an event starting at 19:00 and ending at 02:00 elongates to its full duration, staying in the day it started on", () => {
    const { container } = render(
      <WeekCalendarClient rooms={[]} events={[baseEvent({ start_time: "19:00:00", end_time: "02:00:00" })]} totalCapacity={0} />
    );
    const block = container.querySelector(".cal-event") as HTMLElement;
    expect(block).toBeTruthy();
    // 19:00 → 1140min, 02:00 wraps to 1560min (26:00) on the grid's scale:
    // top = (1140 - 7*60)/60 * 44 = 528px, height = (1560-1140)/60 * 44 = 308px
    // — the full 7-hour span, not clamped to a sliver by a negative diff.
    expect(block.style.top).toBe("528px");
    expect(block.style.height).toBe("308px");
  });

  it("a normal same-day event (10:00-12:00) is unaffected by the midnight-wrap logic", () => {
    const { container } = render(
      <WeekCalendarClient rooms={[]} events={[baseEvent({ start_time: "10:00:00", end_time: "12:00:00" })]} totalCapacity={0} />
    );
    const block = container.querySelector(".cal-event") as HTMLElement;
    // top = (600 - 420)/60*44 = 132px, height = (720-600)/60*44 = 88px
    expect(block.style.top).toBe("132px");
    expect(block.style.height).toBe("88px");
  });
});
