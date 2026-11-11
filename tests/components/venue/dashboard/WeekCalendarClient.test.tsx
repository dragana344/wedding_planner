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
    seating_self_edit_enabled: null, seating_mode: "full",
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

describe("WeekCalendarClient — two events on one day", () => {
  const two = [
    baseEvent({ id: "a", couple_names: "Ана и Петар", start_time: "18:00:00", end_time: "23:00:00" }),
    baseEvent({ id: "b", couple_names: "Роденден Мила", event_type: "birthday", start_time: "19:00:00", end_time: "22:00:00" }),
  ];

  it("puts overlapping events side by side as two thinner columns", () => {
    const { container } = render(<WeekCalendarClient rooms={[]} events={two} totalCapacity={0} />);
    const blocks = [...container.querySelectorAll(".cal-event")] as HTMLElement[];
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.style.left)).toEqual(["calc(0% + 3px)", "calc(50% + 3px)"]);
    expect(blocks.every((b) => b.style.width === "calc(50% - 6px)")).toBe(true);
  });

  it("marks the day with an event count in the header and dots in the small calendar", () => {
    render(<WeekCalendarClient rooms={[]} events={two} totalCapacity={0} />);
    expect(screen.getByText("2 настани", { selector: ".cal-multi" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 настани" })).toBeInTheDocument();
  });

  it("keeps a lone event full width", () => {
    const { container } = render(<WeekCalendarClient rooms={[]} events={[two[0]]} totalCapacity={0} />);
    const block = container.querySelector(".cal-event") as HTMLElement;
    expect(block.style.width).toBe("calc(100% - 6px)");
    expect(container.querySelector(".cal-multi")).toBeNull();
  });
});

describe("WeekCalendarClient — room colors", () => {
  const rooms = [
    { id: "r1", name: "Голема сала", seatTotal: 200 },
    { id: "r2", name: "Тераса", seatTotal: 60 },
  ] as never;

  it("colors each event by its room and names every room's color in a legend", () => {
    const { container } = render(
      <WeekCalendarClient
        rooms={rooms}
        events={[
          baseEvent({ id: "a", room_ids: ["r1"], start_time: "18:00:00", end_time: "23:00:00" }),
          baseEvent({ id: "b", room_ids: ["r2"], start_time: "19:00:00", end_time: "22:00:00" }),
          baseEvent({ id: "c", room_ids: [], start_time: "10:00:00", end_time: "12:00:00" }),
        ]}
        totalCapacity={0}
      />,
    );
    const legend = screen.getByLabelText("Боја по сала");
    expect(legend).toHaveTextContent("Голема сала");
    expect(legend).toHaveTextContent("Тераса");
    expect(legend).toHaveTextContent("Без сала");
    const colorOf = (id: string) =>
      ([...container.querySelectorAll(".cal-event")] as HTMLElement[]).find((el) => el.getAttribute("href")?.endsWith(id))!.style.borderLeftColor;
    expect(colorOf("=a")).toBe("rgb(201, 153, 47)");
    expect(colorOf("=b")).toBe("rgb(37, 99, 235)");
    expect(colorOf("=c")).toBe("rgb(139, 143, 153)");
  });
});
