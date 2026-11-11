import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GuestRail } from "@/components/seating/GuestRail";
import type { SeatGuest } from "@/lib/seating/types";

// Not alphabetical: the same order getRoomSeating now returns (created_at),
// matching the organizer's own Guests page — entered family by family.
const guests: SeatGuest[] = [
  { id: "g1", fullName: "Марко Стојанов", partySize: 1, seatsTaken: 0, side: "groom" },
  { id: "g2", fullName: "Ана Петровска", partySize: 2, seatsTaken: 1, side: "bride" },
  { id: "g3", fullName: "Бојан Трајков", partySize: 1, seatsTaken: 1, side: null },
];

function setup(overrides: Partial<Parameters<typeof GuestRail>[0]> = {}) {
  const onDragStart = vi.fn();
  render(<GuestRail guests={guests} draggingGuestId={null} onDragStart={onDragStart} {...overrides} />);
  return { onDragStart };
}

describe("GuestRail", () => {
  it("lists guests in the given order, not alphabetically, with their seated count", () => {
    setup();
    const rows = screen.getAllByTestId(/^guest-rail-row-/);
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Марко Стојанов"),
      expect.stringContaining("Ана Петровска"),
      expect.stringContaining("Бојан Трајков"),
    ]);
    expect(screen.getByText("1/2")).toBeInTheDocument(); // Ана: partially seated
    expect(screen.getByText("1/1")).toBeInTheDocument(); // Бојан: fully seated
  });

  it("filters by name", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Пребарај гостин"), { target: { value: "бој" } });
    expect(screen.getByText("Бојан Трајков")).toBeInTheDocument();
    expect(screen.queryByText("Марко Стојанов")).not.toBeInTheDocument();
  });

  it("starts a drag on pointer-down", () => {
    const { onDragStart } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Повлечи Ана Петровска" }));
    expect(onDragStart).toHaveBeenCalledWith("g2");
  });

  it("highlights the row currently being dragged", () => {
    setup({ draggingGuestId: "g3" });
    expect(screen.getByTestId("guest-rail-row-g3")).toHaveClass("bg-lilac-light");
    expect(screen.getByTestId("guest-rail-row-g1")).not.toHaveClass("bg-lilac-light");
  });
});
