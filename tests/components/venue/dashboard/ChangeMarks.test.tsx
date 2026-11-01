import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ManagerElevationProvider } from "@/components/venue/shell/ManagerElevationContext";
import { EventsClient } from "@/components/venue/dashboard/EventsClient";
import { WeekCalendarClient } from "@/components/venue/dashboard/WeekCalendarClient";
import type { EventDetail } from "@/lib/venue/events";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ev(overrides: Partial<EventDetail>): EventDetail {
  return {
    id: "e1", couple_names: "Ана и Петар", event_date: today(), start_time: "10:00:00", end_time: "12:00:00", status: "confirmed",
    event_type: "wedding", guest_count_estimate: 100, created_at: "2026-01-01T10:00:00Z", menus: [], room_ids: [],
    hasShowcasePhotos: false, seatedCount: 0, contact_email: null, contact_email_2: null, contact_phone: null, total_price: null,
    deposit_paid: null, hasUnseenSeatingChange: false, unseenSections: [], menuNumbers: { latest: null, previous: null },
    ...overrides,
  };
}

function renderList(events: EventDetail[]) {
  return render(<ManagerElevationProvider><EventsClient venueId="v1" initialEvents={events} rooms={[]} menuTemplates={[]} initialFilter="all" /></ManagerElevationProvider>);
}

describe("change marks on events", () => {
  it("events list: ! only on an event with unseen sections", () => {
    renderList([ev({ id: "a", couple_names: "Со промена", unseenSections: ["guest_count"] }), ev({ id: "b", couple_names: "Без промена" })]);
    const marks = screen.getAllByRole("img", { name: "Има промени од парот" });
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveTextContent("!");
    expect(marks[0]).toHaveClass("change-mark");
  });

  it("Нови бројки hint follows menu_numbers in unseenSections", () => {
    const { unmount } = renderList([ev({ unseenSections: ["guest_count"] })]);
    expect(screen.queryByText("Нови бројки")).toBeNull();
    unmount();
    renderList([ev({ unseenSections: ["menu_numbers"] })]);
    expect(screen.getByText("Нови бројки")).toBeInTheDocument();
  });

  it("calendar: ! on an event with unseen sections", () => {
    render(<WeekCalendarClient rooms={[]} events={[ev({ unseenSections: ["menus"] })]} totalCapacity={0} />);
    expect(screen.getAllByLabelText("Има промени од парот").length).toBeGreaterThan(0);
  });

  it("calendar: no ! without unseen sections", () => {
    render(<WeekCalendarClient rooms={[]} events={[ev({})]} totalCapacity={0} />);
    expect(screen.queryByLabelText("Има промени од парот")).toBeNull();
  });
});
