import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { AllTablesView } from "@/components/seating/AllTablesView";
import type { RoomSeating } from "@/lib/seating/types";

const seating: RoomSeating = {
  tables: [
    { elementId: "t1", label: null, number: 1, capacity: 10 },
    { elementId: "t2", label: "Кумови", number: 2, capacity: 4 },
  ],
  seats: [
    { elementId: "t1", seatNumber: 2, guestId: "g1", guestName: null, displayName: "Ана Петровска" },
    { elementId: "t1", seatNumber: 1, guestId: null, guestName: "Баба Марија", displayName: "Баба Марија" },
    { elementId: "t2", seatNumber: 1, guestId: null, guestName: "Горан", displayName: "Горан" },
  ],
  guests: [],
};

describe("AllTablesView", () => {
  it("shows every table's list with its fill counter", () => {
    render(<AllTablesView roomName="Голема сала" seating={seating} highlightedId={null} onHighlight={() => {}} />);
    const first = screen.getByRole("button", { name: /Маса 1/ });
    expect(within(first).getByText("2/10")).toBeInTheDocument();
    const names = within(first).getAllByRole("listitem").map((li) => li.textContent);
    expect(names).toEqual(["1. Баба Марија", "2. Ана Петровска"]);
    expect(within(screen.getByRole("button", { name: /Кумови/ })).getByText("1/4")).toBeInTheDocument();
  });

  it("highlights the picked table on the plan", () => {
    const onHighlight = vi.fn();
    render(<AllTablesView roomName="Сала" seating={seating} highlightedId="t2" onHighlight={onHighlight} />);
    expect(screen.getByRole("button", { name: /Кумови/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Маса 1/ }));
    expect(onHighlight).toHaveBeenCalledWith("t1");
    fireEvent.click(screen.getByRole("button", { name: /Кумови/ }));
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  it("exports the lists as a UTF-8 CSV named after the room", async () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:x");
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<AllTablesView roomName="Голема сала" seating={seating} highlightedId={null} onHighlight={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Извези CSV" }));
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(text).toContain("Голема сала;Кумови;1;Горан");
    expect(click).toHaveBeenCalled();
  });

  it("prints the lists", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<AllTablesView roomName="Сала" seating={seating} highlightedId={null} onHighlight={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Печати листи" }));
    expect(print).toHaveBeenCalled();
  });

  it("lists guests holding more seats than their party size (review M8)", () => {
    const over = {
      ...seating,
      guests: [
        { id: "g1", fullName: "Ана Петровска", partySize: 1, seatsTaken: 2, side: null },
        { id: "g2", fullName: "Марко", partySize: 3, seatsTaken: 2, side: null },
      ],
    };
    render(<AllTablesView roomName="Сала" seating={over} highlightedId={null} onHighlight={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Повеќе места од бројот на лица: Ана Петровска (2/1)");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Марко");
  });

  it("shows no warning when everyone fits", () => {
    render(<AllTablesView roomName="Сала" seating={seating} highlightedId={null} onHighlight={() => {}} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
