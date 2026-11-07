import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MiniEventTablesTab } from "@/components/venue/dashboard/MiniEventTablesTab";
import * as floorplan from "@/lib/venue/floorplan";
import * as rooms from "@/lib/venue/rooms";
import * as reservations from "@/lib/venue/reservations";
import * as venueProfile from "@/lib/venue/venue-profile";
import type { Reservation } from "@/lib/venue/reservations";

const room = { id: "r1", venue_id: "v1", name: "Hall", width_cm: 2000, height_cm: 1500 };
const table: Reservation["table_ids"] = ["t1"];

const reservation: Reservation = {
  id: "res1",
  venue_id: "v1",
  room_id: "r1",
  guest_name: "Iva's Birthday",
  phone: "070111222",
  email: null,
  date: "2026-12-01",
  start_time: "18:00",
  end_time: null,
  party_size: 10,
  status: "reserved",
  event_type: null,
  note: null,
  server_name: null,
  event_id: "e1",
  table_ids: table,
};

function mockAll() {
  vi.spyOn(reservations, "getReservationForEvent").mockResolvedValue(reservation);
  vi.spyOn(rooms, "getRoomById").mockResolvedValue(room as never);
  vi.spyOn(floorplan, "listFixedElements").mockResolvedValue([]);
  vi.spyOn(floorplan, "listRoomLayoutElements").mockResolvedValue([
    {
      id: "t1",
      room_id: "r1",
      element_type: "table",
      table_type_id: "tt1",
      x_cm: 100,
      y_cm: 100,
      width_cm: 150,
      length_cm: 150,
      rotation_deg: 0,
      label: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "t2",
      room_id: "r1",
      element_type: "table",
      table_type_id: "tt1",
      x_cm: 400,
      y_cm: 100,
      width_cm: 150,
      length_cm: 150,
      rotation_deg: 0,
      label: null,
      created_at: "2026-01-01T00:00:01Z",
    },
  ]);
  vi.spyOn(rooms, "listTableTypes").mockResolvedValue([
    { id: "tt1", room_id: "r1", name: "Round-8", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 5 },
  ]);
  vi.spyOn(reservations, "getTableAvailability").mockResolvedValue({ reserved: [] });
  vi.spyOn(venueProfile, "getVenueLogoUrl").mockResolvedValue(null);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("MiniEventTablesTab (Project B §3)", () => {
  it("loads the linked reservation's room and shows its current tables, pre-selected", async () => {
    mockAll();
    render(<MiniEventTablesTab eventId="e1" />);

    expect(await screen.findByTestId("floor-plan-element-t1")).toBeInTheDocument();
    expect(screen.getByText("1 маси · 8 седишта")).toBeInTheDocument();
  });

  it("adding a table updates the count, and saving calls updateReservationTables with every selected table", async () => {
    mockAll();
    const updateSpy = vi.spyOn(reservations, "updateReservationTables").mockResolvedValue({ ...reservation, table_ids: ["t1", "t2"] });
    render(<MiniEventTablesTab eventId="e1" />);

    await screen.findByTestId("floor-plan-element-t1");
    fireEvent.pointerDown(screen.getByTestId("floor-plan-element-t2"));
    fireEvent.pointerUp(window);
    expect(screen.getByText("2 маси · 16 седишта")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Зачувај маси" }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith("res1", "r1", "2026-12-01", "18:00", null, ["t1", "t2"]));
    expect(await screen.findByText("Зачувано.")).toBeInTheDocument();
  });

  it("shows the save error when the server refuses (e.g. a conflicting table)", async () => {
    mockAll();
    vi.spyOn(reservations, "updateReservationTables").mockRejectedValue(new Error("Една или повеќе од избраните маси се веќе резервирани за тоа време."));
    render(<MiniEventTablesTab eventId="e1" />);

    await screen.findByTestId("floor-plan-element-t1");
    fireEvent.click(screen.getByRole("button", { name: "Зачувај маси" }));
    expect(await screen.findByText(/веќе резервирани/i)).toBeInTheDocument();
  });
});
