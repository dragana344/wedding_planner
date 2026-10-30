import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HourOccupancySlider, occupancyColor } from "@/components/venue/dashboard/HourOccupancySlider";
import type { HourOccupancy } from "@/lib/venue/occupancy";

function hours(overrides: Partial<Record<number, number>> = {}): HourOccupancy[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    reservedTables: 0,
    totalTables: 10,
    pct: overrides[hour] ?? 0,
  }));
}

describe("occupancyColor", () => {
  it("is pure green at 0%", () => {
    expect(occupancyColor(0)).toBe("rgb(22, 163, 74)");
  });

  it("is pure red at 100%", () => {
    expect(occupancyColor(100)).toBe("rgb(220, 38, 38)");
  });

  it("clamps out-of-range values", () => {
    expect(occupancyColor(-10)).toBe(occupancyColor(0));
    expect(occupancyColor(150)).toBe(occupancyColor(100));
  });
});

describe("HourOccupancySlider", () => {
  it("renders a segment with its percentage for every hour", () => {
    render(<HourOccupancySlider hours={hours({ 14: 42 })} activeHour={0} onHourChange={vi.fn()} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(24);
  });

  it("marks the active hour's segment as pressed", () => {
    render(<HourOccupancySlider hours={hours()} activeHour={9} onHourChange={vi.fn()} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("aria-valuenow", "9");
  });

  it("calls onHourChange when a segment is clicked", () => {
    const onHourChange = vi.fn();
    render(<HourOccupancySlider hours={hours()} activeHour={0} onHourChange={onHourChange} />);
    screen.getByText("17ч").click();
    expect(onHourChange).toHaveBeenCalledWith(17);
  });

  it("moves the active hour with arrow keys", () => {
    const onHourChange = vi.fn();
    render(<HourOccupancySlider hours={hours()} activeHour={5} onHourChange={onHourChange} />);
    const slider = screen.getByRole("slider");
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
    expect(onHourChange).toHaveBeenCalledWith(6);
  });
});
