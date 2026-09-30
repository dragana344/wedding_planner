import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ReportsClient } from "@/components/venue/dashboard/ReportsClient";
import { NotificationsList } from "@/components/venue/dashboard/NotificationsList";
import type { ReportData } from "@/lib/venue/reports";

const report: ReportData = {
  byMonth: [
    { month: "2026-12", events: 1, guests: 200, revenue: 100000, deposits: 20000 },
    { month: "2027-01", events: 3, guests: 500, revenue: 130000, deposits: 20000 },
  ],
  byType: [{ type: "wedding", count: 3 }, { type: "birthday", count: 1 }],
  byStatus: [{ status: "confirmed", count: 3 }, { status: "cancelled", count: 1 }],
  byRoom: [
    { roomId: "big", roomName: "Голема сала", events: 3, seatCapacity: 400, avgFill: 0.7 },
    { roomId: "small", roomName: "Мала сала", events: 0, seatCapacity: 100, avgFill: null },
  ],
  totals: { events: 4, guests: 700, revenue: 230000, deposits: 40000 },
};
const rooms = [{ id: "big", name: "Голема сала" }, { id: "small", name: "Мала сала" }];

describe("ReportsClient (B9)", () => {
  it("shows the totals, months, types and hall fill", () => {
    render(<ReportsClient report={report} rooms={rooms} filters={{ from: "2026-12-01", to: "2027-01-31" }} />);
    const kpis = screen.getByRole("region", { name: "Вкупно" });
    expect(within(kpis).getByText("4")).toBeInTheDocument();
    expect(within(kpis).getByText("700")).toBeInTheDocument();
    expect(within(kpis).getByText(/230\.000 ден/)).toBeInTheDocument();
    const months = screen.getByRole("table", { name: "По месец" });
    expect(within(months).getAllByRole("row")).toHaveLength(3);
    expect(within(months).getByText("јануари 2027")).toBeInTheDocument();
    expect(screen.getByText("Свадба")).toBeInTheDocument();
    expect(screen.getByText("Откажан")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByLabelText("Од")).toHaveValue("2026-12-01");
    expect(screen.getByLabelText("Сала")).toHaveValue("");
  });

  it("says so when the period has no events", () => {
    const empty = { ...report, byMonth: [], byType: [], byStatus: [], totals: { events: 0, guests: 0, revenue: 0, deposits: 0 } };
    render(<ReportsClient report={empty} rooms={rooms} filters={{ from: "2027-01-01", to: "2027-12-31" }} />);
    expect(screen.getByText("Нема настани во избраниот период.")).toBeInTheDocument();
  });
});

describe("NotificationsList (B9)", () => {
  it("groups by day, newest first", () => {
    render(
      <NotificationsList
        today="2027-06-12"
        items={[
          { id: "1", at: "2027-06-12T10:00:00Z", kind: "rsvp_changed", eventId: "e1", title: "Одговор на поканата: Ана & Марко", detail: "Без одговор → Доаѓа" },
          { id: "2", at: "2027-06-10T09:00:00Z", kind: "event_created", eventId: "e1", title: "Нов настан: Ана & Марко", detail: "2027-06-12" },
        ]}
      />,
    );
    const days = screen.getAllByRole("heading", { level: 3 });
    expect(days.map((d) => d.textContent)).toEqual(["Денес", "10 јуни 2027"]);
    expect(screen.getByText("Без одговор → Доаѓа")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Ана & Марко/ })[0]).toHaveAttribute("href", "/venue/events?event=e1");
  });

  it("has an empty state", () => {
    render(<NotificationsList today="2027-06-12" items={[]} />);
    expect(screen.getByText("Сè уште нема известувања.")).toBeInTheDocument();
  });
});
