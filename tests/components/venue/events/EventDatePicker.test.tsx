import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventDatePicker } from "@/components/venue/events/EventDatePicker";
import { roomColor } from "@/lib/venue/calendar-colors";

const roomA = { id: "r1", name: "Голема сала" };
const roomB = { id: "r2", name: "Мала сала" };

describe("EventDatePicker", () => {
  it("rings a date booked in one room with that room's own color, and lists only booked rooms in the legend", () => {
    render(
      <EventDatePicker
        value="2027-10-01"
        onChange={vi.fn()}
        rooms={[roomA, roomB]}
        bookedDatesByRoom={{ r1: ["2027-10-10"] }}
        onMonthChange={vi.fn()}
      />,
    );
    const day10 = screen.getByRole("button", { name: "10" });
    expect(day10.style.boxShadow).toBe(`0 0 0 1px ${roomColor("r1", ["r1", "r2"])}`);
    expect(day10).toHaveAttribute("title", "Веќе зафатено: Голема сала");

    const day11 = screen.getByRole("button", { name: "11" });
    expect(day11.style.boxShadow).toBe("");

    expect(screen.getByText("Голема сала")).toBeInTheDocument();
    expect(screen.queryByText("Мала сала")).not.toBeInTheDocument();
  });

  it("stacks two concentric rings, one per room, when two rooms are booked the same day", () => {
    render(
      <EventDatePicker
        value="2027-10-01"
        onChange={vi.fn()}
        rooms={[roomA, roomB]}
        bookedDatesByRoom={{ r1: ["2027-10-10"], r2: ["2027-10-10"] }}
        onMonthChange={vi.fn()}
      />,
    );
    const day10 = screen.getByRole("button", { name: "10" });
    const colorA = roomColor("r1", ["r1", "r2"]);
    const colorB = roomColor("r2", ["r1", "r2"]);
    expect(day10.style.boxShadow).toBe(`0 0 0 1px ${colorA}, 0 0 0 4px ${colorB}`);
    expect(day10).toHaveAttribute("title", "Веќе зафатено: Голема сала, Мала сала");

    expect(screen.getByText("Голема сала")).toBeInTheDocument();
    expect(screen.getByText("Мала сала")).toBeInTheDocument();
  });

  it("calls onChange with the clicked date and onMonthChange with the visible month", async () => {
    const onChange = vi.fn();
    const onMonthChange = vi.fn();
    render(
      <EventDatePicker value="2027-10-05" onChange={onChange} rooms={[]} bookedDatesByRoom={{}} onMonthChange={onMonthChange} />,
    );
    expect(onMonthChange).toHaveBeenCalledWith(2027, 9); // 0-indexed October
    await userEvent.click(screen.getByRole("button", { name: "12" }));
    expect(onChange).toHaveBeenCalledWith("2027-10-12");
  });

  it("navigating to the next month fires onMonthChange again for the new month", async () => {
    const onMonthChange = vi.fn();
    render(
      <EventDatePicker value="2027-10-05" onChange={vi.fn()} rooms={[]} bookedDatesByRoom={{}} onMonthChange={onMonthChange} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Следен месец" }));
    expect(onMonthChange).toHaveBeenLastCalledWith(2027, 10); // November
  });

  it("shows no legend when nothing is booked", () => {
    render(
      <EventDatePicker value="" onChange={vi.fn()} rooms={[roomA, roomB]} bookedDatesByRoom={{}} onMonthChange={vi.fn()} />,
    );
    expect(screen.queryByText("Голема сала")).not.toBeInTheDocument();
    expect(screen.queryByText("Мала сала")).not.toBeInTheDocument();
  });
  it("shows one dot per event already on a date, highlighting days with two or more", () => {
    render(
      <EventDatePicker
        value="2027-10-01"
        onChange={vi.fn()}
        rooms={[roomA]}
        bookedDatesByRoom={{}}
        eventCountsByDate={{ "2027-10-10": 2, "2027-10-12": 1 }}
        onMonthChange={vi.fn()}
      />,
    );
    const day10 = screen.getByRole("button", { name: /^10/ });
    expect(day10).toHaveAttribute("title", "2 настани");
    expect(day10.querySelectorAll(".ev-cal-dots.is-multi i")).toHaveLength(2);
    const day12 = screen.getByRole("button", { name: /^12/ });
    expect(day12.querySelectorAll(".ev-cal-dots:not(.is-multi) i")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "11" }).querySelector(".ev-cal-dots")).toBeNull();
  });
});
