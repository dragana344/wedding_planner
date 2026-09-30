import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const lib = vi.hoisted(() => ({ updateTableType: vi.fn(), upsertTableType: vi.fn(), seatsAffectedByTableType: vi.fn() }));
vi.mock("@/lib/venue/rooms", async (importOriginal) => ({ ...(await importOriginal<object>()), ...lib }));

import { TableTypeForm } from "@/components/venue/TableTypeForm";

const type = { id: "tt1", room_id: "r1", name: "Округла", shape: "round" as const, seats: 12, width_cm: 180, length_cm: 180, quantity: 10 };

beforeEach(() => {
  vi.restoreAllMocks();
  lib.updateTableType.mockReset().mockResolvedValue(type);
  lib.seatsAffectedByTableType.mockReset();
});

describe("TableTypeForm: fewer seats (review I3)", () => {
  it("warns how many seated guests lose their seat, and keeps the type when declined", async () => {
    lib.seatsAffectedByTableType.mockResolvedValue(3);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TableTypeForm roomId="r1" editingType={type} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText(/број на места|седишта|места/i), { target: { value: "10" } });
    fireEvent.submit(screen.getByLabelText(/број на места|седишта|места/i).closest("form")!);
    await waitFor(() => expect(confirm).toHaveBeenCalledWith("3 седнати гости се на столчиња над 10 и ќе го изгубат местото. Продолжи?"));
    expect(lib.seatsAffectedByTableType).toHaveBeenCalledWith("tt1", 10);
    expect(lib.updateTableType).not.toHaveBeenCalled();
  });

  it("saves without asking when nobody is affected", async () => {
    lib.seatsAffectedByTableType.mockResolvedValue(0);
    const confirm = vi.spyOn(window, "confirm");
    render(<TableTypeForm roomId="r1" editingType={type} onSaved={() => {}} />);
    fireEvent.change(screen.getByLabelText(/број на места|седишта|места/i), { target: { value: "10" } });
    fireEvent.submit(screen.getByLabelText(/број на места|седишта|места/i).closest("form")!);
    await waitFor(() => expect(lib.updateTableType).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });
});
