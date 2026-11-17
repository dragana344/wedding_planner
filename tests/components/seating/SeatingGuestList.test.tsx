import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SeatingGuestList } from "@/components/seating/SeatingGuestList";
import type { RoomSeating } from "@/lib/seating/types";

const seating = {
  tables: [
    { elementId: "t1", label: null, number: 1, capacity: 10 },
    { elementId: "t2", label: "Кумови", number: 2, capacity: 8 },
  ],
  seats: [
    { elementId: "t2", seatNumber: 1, guestId: "g1", guestName: null, displayName: "Ана" },
    { elementId: "t2", seatNumber: 2, guestId: "g1", guestName: null, displayName: "Ана" },
  ],
  guests: [
    { id: "g1", fullName: "Ана Петровска", partySize: 2, seatsTaken: 2, side: "bride" },
    { id: "g2", fullName: "Марко Стојанов", partySize: 3, seatsTaken: 0, side: "groom" },
  ],
} as unknown as RoomSeating;

describe("SeatingGuestList (phone seating, from the guests' side)", () => {
  it("shows each guest's seats and table, and filters to the ones still without a seat", () => {
    render(<SeatingGuestList seating={seating} onPick={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Ана Петровска: 2 од 2 места, Кумови/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Марко Стојанов: 0 од 3 места\. Избери маса/ })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Само без место (1)"));
    expect(screen.queryByText("Ана Петровска")).not.toBeInTheDocument();
    expect(screen.getByText("Марко Стојанов")).toBeInTheDocument();
  });

  it("searches by name and hands a tapped guest to onPick", () => {
    const onPick = vi.fn();
    render(<SeatingGuestList seating={seating} onPick={onPick} />);
    fireEvent.change(screen.getByLabelText("Пребарај гостин"), { target: { value: "марко" } });
    expect(screen.queryByText("Ана Петровска")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Марко Стојанов/ }));
    expect(onPick).toHaveBeenCalledWith("g2");
  });

  it("can't pick tables when the seating is read-only", () => {
    render(<SeatingGuestList seating={seating} onPick={vi.fn()} readOnly />);
    expect(screen.getByRole("button", { name: /Марко Стојанов/ })).toBeDisabled();
  });
});
