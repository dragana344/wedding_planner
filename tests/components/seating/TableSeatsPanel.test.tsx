import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { TableSeatsPanel } from "@/components/seating/TableSeatsPanel";
import type { Seat, SeatGuest, SeatTable } from "@/lib/seating/types";

const table: SeatTable = { elementId: "t1", label: null, number: 3, capacity: 10 };
const guests: SeatGuest[] = [
  { id: "g1", fullName: "Ана Петровска", partySize: 1, seatsTaken: 1, side: "bride" },
  { id: "g2", fullName: "Марко Стојанов", partySize: 1, seatsTaken: 0, side: "groom" },
  { id: "g3", fullName: "Семејство Илиевски", partySize: 3, seatsTaken: 1, side: null },
  { id: "g4", fullName: "Анита Трајкова", partySize: 1, seatsTaken: 1, side: null }, // sits elsewhere
];
const seats: Seat[] = [
  { elementId: "t1", seatNumber: 1, guestId: "g1", guestName: null, displayName: "Ана Петровска" },
  { elementId: "t1", seatNumber: 2, guestId: null, guestName: "Баба Марија", displayName: "Баба Марија" },
];

function setup(overrides: Partial<Parameters<typeof TableSeatsPanel>[0]> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<TableSeatsPanel table={table} seats={seats} guests={guests} onSave={onSave} {...overrides} />);
  return { onSave };
}

describe("TableSeatsPanel", () => {
  it("shows one numbered field per seat and the fill counter", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Маса 3" })).toBeInTheDocument();
    for (let n = 1; n <= 10; n++) expect(screen.getByLabelText(`Столче ${n}`)).toBeInTheDocument();
    expect(screen.getByLabelText("Столче 1")).toHaveValue("Ана Петровска");
    expect(screen.getByLabelText("Столче 2")).toHaveValue("Баба Марија");
    expect(screen.getByText("2/10")).toBeInTheDocument();
  });

  it("suggests only guests who still have a free seat", () => {
    setup();
    const field = screen.getByLabelText("Столче 3");
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "ан" } });
    const list = screen.getByRole("listbox");
    // Ана sits here already, Анита sits at another table: neither is offered.
    expect(within(list).queryByText("Ана Петровска")).not.toBeInTheDocument();
    expect(within(list).queryByText("Анита Трајкова")).not.toBeInTheDocument();
    fireEvent.change(field, { target: { value: "" } });
    expect(within(screen.getByRole("listbox")).getByText("Марко Стојанов")).toBeInTheDocument();
    expect(within(screen.getByRole("listbox")).getByText("Семејство Илиевски")).toBeInTheDocument();
  });

  it("saves a picked guest, free text and cleared seats together", async () => {
    const { onSave } = setup();
    const field = screen.getByLabelText("Столче 3");
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: "мар" } });
    fireEvent.click(within(screen.getByRole("listbox")).getByText("Марко Стојанов"));
    fireEvent.change(screen.getByLabelText("Столче 5"), { target: { value: "Кум Горан" } });
    fireEvent.change(screen.getByLabelText("Столче 2"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith([
      { seatNumber: 1, guestId: "g1", guestName: null },
      { seatNumber: 3, guestId: "g2", guestName: null },
      { seatNumber: 5, guestId: null, guestName: "Кум Горан" },
    ]);
    expect(screen.getByText("3/10")).toBeInTheDocument();
  });

  it("typing over a picked guest turns the seat into free text", async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByLabelText("Столче 1"), { target: { value: "Ана П. (друга)" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0][0]).toEqual({ seatNumber: 1, guestId: null, guestName: "Ана П. (друга)" });
  });

  it("drags a person from one seat to another", async () => {
    const { onSave } = setup();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Премести од столче 1" }));
    fireEvent.pointerUp(screen.getByTestId("seat-row-4"));
    expect(screen.getByLabelText("Столче 1")).toHaveValue("");
    expect(screen.getByLabelText("Столче 4")).toHaveValue("Ана Петровска");
    fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).toEqual([
      { seatNumber: 2, guestId: null, guestName: "Баба Марија" },
      { seatNumber: 4, guestId: "g1", guestName: null },
    ]);
  });

  it("warns when a guest holds more seats than their party size", () => {
    setup({
      seats: [
        ...seats,
        { elementId: "t1", seatNumber: 3, guestId: "g2", guestName: null, displayName: "Марко Стојанов" },
      ],
      guests: guests.map((g) => (g.id === "g2" ? { ...g, seatsTaken: 2 } : g)),
    });
    expect(screen.getByText(/Марко Стојанов: повеќе места од бројот на лица/)).toBeInTheDocument();
  });

  it("shows a save error from the server", async () => {
    setup({ onSave: vi.fn().mockRejectedValue(new Error("Столчето е зафатено или надвор од масата.")) });
    fireEvent.change(screen.getByLabelText("Столче 6"), { target: { value: "Некој" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
    expect(await screen.findByText("Столчето е зафатено или надвор од масата.")).toBeInTheDocument();
  });

  it("is read-only for venue staff", () => {
    setup({ readOnly: true, guests: [] });
    expect(screen.getByText("Ана Петровска")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Зачувај" })).not.toBeInTheDocument();
  });
});
