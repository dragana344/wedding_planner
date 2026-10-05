import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SpaceCard } from "@/components/venue/dashboard/SpaceCard";
import * as rooms from "@/lib/venue/rooms";
import type { RoomWithSeatTotal, TableType } from "@/lib/venue/rooms";

vi.mock("@/lib/venue/rooms", async () => {
  const actual = await vi.importActual<typeof import("@/lib/venue/rooms")>("@/lib/venue/rooms");
  return {
    ...actual,
    listTableTypes: vi.fn(),
    updateRoomName: vi.fn(),
    deleteRoom: vi.fn(),
    roomUsage: vi.fn().mockResolvedValue({ events: 0, reservations: 0 }),
    deleteTableType: vi.fn(),
    seatsAffectedByTableType: vi.fn().mockResolvedValue(0),
    upsertTableType: vi.fn(),
    updateTableType: vi.fn(),
  };
});

const room: RoomWithSeatTotal = {
  id: "r1",
  venue_id: "v1",
  name: "Test Room",
  width_cm: 1000,
  height_cm: 800,
  tableTypeCount: 1,
  seatTotal: 8,
};

const tableType: TableType = {
  id: "t1",
  room_id: "r1",
  name: "Round-8",
  shape: "round",
  seats: 8,
  width_cm: 150,
  length_cm: 150,
  quantity: 1,
};

describe("SpaceCard", () => {
  beforeEach(() => {
    vi.mocked(rooms.listTableTypes).mockResolvedValue([tableType]);
    vi.mocked(rooms.deleteTableType).mockResolvedValue(undefined);
    vi.mocked(rooms.deleteRoom).mockResolvedValue(undefined);
  });

  it("calls onChanged after deleting a table type, so the parent's count can refresh", async () => {
    const onChanged = vi.fn();
    render(<SpaceCard room={room} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /test room/i }));
    await screen.findByText(/round-8/i);

    fireEvent.click(screen.getByRole("button", { name: /избриши round-8/i }));
    fireEvent.click(screen.getByRole("button", { name: "Да, избриши" }));

    await waitFor(() => expect(rooms.deleteTableType).toHaveBeenCalledWith("t1"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("calls onChanged after deleting the space", async () => {
    const onChanged = vi.fn();
    render(<SpaceCard room={room} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /test room/i }));
    await screen.findByText(/round-8/i);

    fireEvent.click(screen.getByRole("button", { name: /избриши просторија/i }));
    fireEvent.click(screen.getByRole("button", { name: "Да, избриши" }));

    await waitFor(() => expect(rooms.deleteRoom).toHaveBeenCalledWith("r1"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("says what a room in use takes with it before it is deleted", async () => {
    vi.mocked(rooms.roomUsage).mockResolvedValueOnce({ events: 2, reservations: 1 });
    render(<SpaceCard room={room} onChanged={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /test room/i }));
    await screen.findByText(/round-8/i);
    fireEvent.click(screen.getByRole("button", { name: /избриши просторија/i }));

    expect(await screen.findByText(/има 2 настани и 1 идна резервација/)).toBeInTheDocument();
    expect(rooms.deleteRoom).not.toHaveBeenCalled();
  });

  it("calls onChanged after adding a table type", async () => {
    vi.mocked(rooms.upsertTableType).mockResolvedValue({ ...tableType, id: "t2" });
    const onChanged = vi.fn();
    render(<SpaceCard room={room} onChanged={onChanged} />);

    fireEvent.click(screen.getByRole("button", { name: /test room/i }));
    await screen.findByText(/round-8/i);

    fireEvent.click(screen.getByRole("button", { name: /додади вид маса/i }));
    fireEvent.change(screen.getByLabelText(/име на видот маса/i), { target: { value: "New Type" } });
    fireEvent.click(screen.getByRole("button", { name: /зачувај вид маса/i }));

    await waitFor(() => expect(rooms.upsertTableType).toHaveBeenCalled());
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
