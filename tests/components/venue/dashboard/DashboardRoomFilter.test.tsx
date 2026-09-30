import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DashboardClient } from "@/components/venue/dashboard/DashboardClient";
import type { EventDetail } from "@/lib/venue/events";

vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const rooms = [
  { id: "r1", venue_id: "v1", name: "Голема сала", width_cm: 3600, height_cm: 2100, seatTotal: 400 },
  { id: "r2", venue_id: "v1", name: "Мала сала", width_cm: 1500, height_cm: 1000, seatTotal: 80 },
];

function ev(id: string, name: string, roomIds: string[]): EventDetail {
  return {
    id, couple_names: name, event_date: "2027-06-01", start_time: "19:00", end_time: null, status: "confirmed", event_type: "wedding",
    guest_count_estimate: 100, menu_template_id: null, room_ids: roomIds,
  } as unknown as EventDetail;
}

function renderDashboard() {
  const layout = { fixedElements: [], layoutElements: [], tableTypes: [] };
  render(
    <DashboardClient
      today="2027-06-01"
      rooms={rooms as never}
      roomLayouts={{ r1: layout, r2: layout } as never}
      menuTemplates={[]}
      todayEvents={[ev("e1", "Ана и Марко", ["r1"]), ev("e2", "Роденден Петар", ["r2"])]}
      todayReservations={[]}
      upcomingEvents={[ev("e3", "Свадба Илиевски", ["r1", "r2"])]}
      weekCounts={[]}
      monthEventDays={{}}
      monthLabel="Јуни"
      nextMonthEventDays={{}}
      nextMonthLabel="Јули"
      stats={{ todayCount: 2, todayGuests: 200, peakGuests: 100, inPreparation: 0, completedToday: 0, upcomingCount: 1, totalCapacity: 480 }}
    />,
  );
}

describe("dashboard hall filter (B6)", () => {
  it("shows every hall's events until one hall is picked", () => {
    renderDashboard();
    const filter = screen.getByRole("group", { name: "Сала" });
    expect(within(filter).getByRole("button", { name: "Сите сали" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Ана и Марко")).toBeInTheDocument();
    expect(screen.getByText("Роденден Петар")).toBeInTheDocument();

    fireEvent.click(within(filter).getByRole("button", { name: "Мала сала" }));
    expect(screen.queryByText("Ана и Марко")).not.toBeInTheDocument();
    expect(screen.getByText("Роденден Петар")).toBeInTheDocument();
    expect(screen.getByText("Свадба Илиевски")).toBeInTheDocument(); // uses both halls
  });

  it("links the picked hall's details and a new event in it", () => {
    renderDashboard();
    fireEvent.click(within(screen.getByRole("group", { name: "Сала" })).getByRole("button", { name: "Голема сала" }));
    expect(screen.getByRole("link", { name: "Детали за салата" })).toHaveAttribute("href", "/venue/rooms/r1/floor-plan");
    expect(screen.getByRole("link", { name: "Нов настан во оваа сала" })).toHaveAttribute("href", "/venue/events/new?room=r1");
  });
});
