import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReservationsClient } from "@/components/venue/dashboard/ReservationsClient";
import * as floorplan from "@/lib/venue/floorplan";
import * as rooms from "@/lib/venue/rooms";
import * as reservations from "@/lib/venue/reservations";
import type { Reservation } from "@/lib/venue/reservations";

const room = { id: "r1", venue_id: "v1", name: "Hall", width_cm: 2000, height_cm: 1500, tableTypeCount: 1, seatTotal: 8 };

const base: Reservation = {
  id: "res1",
  venue_id: "v1",
  room_id: "r1",
  guest_name: "Ana Ivanova",
  phone: "070111222",
  email: null,
  date: "2026-11-01",
  start_time: "19:00",
  end_time: "22:00",
  party_size: 4,
  status: "reserved",
  event_type: "wedding",
  note: null,
  table_ids: ["t1"],
};

/** The floor plan always loads on mount, regardless of which part of the
 * merged page a test is exercising — this stubs a single table "t1". */
function mockFloorPlan() {
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
      label: "Round-8",
      created_at: "2026-01-01T00:00:00Z",
    },
  ]);
  vi.spyOn(rooms, "listTableTypes").mockResolvedValue([
    { id: "tt1", room_id: "r1", name: "Round-8", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 5 },
  ]);
  vi.spyOn(reservations, "getTableAvailability").mockResolvedValue({ reserved: [], limited: [] });
}

describe("ReservationsClient", () => {
  it("loads a room's tables, lets the user select one, and creates a reservation on submit", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([]);
    const createSpy = vi.spyOn(reservations, "createReservation").mockResolvedValue({
      id: "res1",
      venue_id: "v1",
      room_id: "r1",
      guest_name: "Ana",
      phone: "070111222",
      email: null,
      date: "2026-11-01",
      start_time: "19:00",
      end_time: null,
      party_size: 4,
      status: "reserved",
      event_type: null,
      note: null,
      table_ids: ["t1"],
    });

    render(<ReservationsClient venueId="v1" initialReservations={[]} rooms={[room]} />);

    await waitFor(() => expect(screen.getByTestId("floor-plan-element-t1")).toBeInTheDocument());
    fireEvent.pointerDown(screen.getByTestId("floor-plan-element-t1"));

    fireEvent.change(screen.getByPlaceholderText(/име и презиме/i), { target: { value: "Ana" } });
    fireEvent.change(screen.getByPlaceholderText("Телефон", { exact: true }), { target: { value: "070111222" } });
    fireEvent.click(screen.getByRole("button", { name: /резервирај маса/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    const call = createSpy.mock.calls[0][0];
    expect(call.table_ids).toEqual(["t1"]);
    expect(call.guest_name).toBe("Ana");
  });

  it("shows the conflicting-table error message when createReservation rejects", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([]);
    vi.spyOn(reservations, "createReservation").mockRejectedValue(
      new Error("One or more selected tables are already reserved for that time.")
    );

    render(<ReservationsClient venueId="v1" initialReservations={[]} rooms={[room]} />);
    await waitFor(() => expect(screen.getByTestId("floor-plan-element-t1")).toBeInTheDocument());
    fireEvent.pointerDown(screen.getByTestId("floor-plan-element-t1"));
    fireEvent.change(screen.getByPlaceholderText(/име и презиме/i), { target: { value: "Ana" } });
    fireEvent.change(screen.getByPlaceholderText("Телефон", { exact: true }), { target: { value: "070111222" } });
    fireEvent.click(screen.getByRole("button", { name: /резервирај маса/i }));

    expect(await screen.findByText(/already reserved/i)).toBeInTheDocument();
  });

  it("marks a table red when it is genuinely reserved (occupied now / imminent), and yellow when only limited", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([]);
    // getTableAvailability reports t1 as "reserved" once the start time is
    // changed to 01:00, and "limited" for the initial 11:00 default.
    const availabilitySpy = vi
      .spyOn(reservations, "getTableAvailability")
      .mockImplementation(async (_roomId, _date, startTime) => {
        if (startTime === "01:00") return { reserved: ["t1"], limited: [] };
        return { reserved: [], limited: ["t1"] };
      });

    const { container } = render(<ReservationsClient venueId="v1" initialReservations={[]} rooms={[room]} />);
    await waitFor(() => expect(screen.getByTestId("floor-plan-element-t1")).toBeInTheDocument());
    await waitFor(() => expect(availabilitySpy).toHaveBeenCalled());

    // Default start time (11:00) is reported "limited" — table renders yellow.
    await waitFor(() => expect(screen.getByTestId("floor-plan-element-t1")).toHaveAttribute("fill", "#EAB308"));

    // Switching to 01:00 is reported "reserved" — table renders red.
    const timeInput = container.querySelector('input[type="time"]');
    expect(timeInput).not.toBeNull();
    fireEvent.change(timeInput as HTMLInputElement, { target: { value: "01:00" } });

    await waitFor(() => expect(screen.getByTestId("floor-plan-element-t1")).toHaveAttribute("fill", "#DC2626"));
  });

  it("shows stat counts and renders each day-list reservation with its status pill", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([base, { ...base, id: "res2", status: "seated" }]);

    render(
      <ReservationsClient
        venueId="v1"
        initialReservations={[base, { ...base, id: "res2", status: "seated" }]}
        rooms={[room]}
      />
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(await screen.findAllByText("Ana Ivanova")).toHaveLength(2);
    expect(screen.getByText("Резервирано")).toBeInTheDocument();
    expect(screen.getByText("Присутни гости")).toBeInTheDocument();
  });

  it("cancelling a day-list reservation permanently deletes it and removes it from the list", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([base]);
    const deleteSpy = vi.spyOn(reservations, "deleteReservation").mockResolvedValue();

    render(<ReservationsClient venueId="v1" initialReservations={[base]} rooms={[room]} />);
    await screen.findByText("Ana Ivanova");
    fireEvent.click(screen.getByRole("button", { name: /откажи/i }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("res1"));
    expect(screen.queryByText("Ana Ivanova")).not.toBeInTheDocument();
  });

  it("moves reserved -> seated as a status update, then freeing the table deletes the reservation entirely", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([base]);
    const updateSpy = vi.spyOn(reservations, "updateReservationStatus").mockResolvedValue();
    const deleteSpy = vi.spyOn(reservations, "deleteReservation").mockResolvedValue();

    render(<ReservationsClient venueId="v1" initialReservations={[base]} rooms={[room]} />);
    await screen.findByText("Ana Ivanova");

    fireEvent.click(screen.getByRole("button", { name: /^зафатена$/i }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith("res1", "seated"));
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(await screen.findByText("Слободна", { selector: "button" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^слободна$/i }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("res1"));
    expect(screen.queryByText("Ana Ivanova")).not.toBeInTheDocument();
  });

  it("filters the day list by room", async () => {
    mockFloorPlan();
    const garden = { id: "r2", venue_id: "v1", name: "Garden", width_cm: 2000, height_cm: 1500, tableTypeCount: 1, seatTotal: 8 };
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([
      { ...base, room_id: "r1" },
      { ...base, id: "res2", guest_name: "Marko Markov", room_id: "r2" },
    ]);

    render(
      <ReservationsClient
        venueId="v1"
        initialReservations={[{ ...base, room_id: "r1" }, { ...base, id: "res2", guest_name: "Marko Markov", room_id: "r2" }]}
        rooms={[room, garden]}
      />
    );
    await screen.findByText("Ana Ivanova");
    fireEvent.click(screen.getByRole("button", { name: "Прикажи резервации за: Garden" }));
    expect(screen.queryByText("Ana Ivanova")).not.toBeInTheDocument();
    expect(screen.getByText("Marko Markov")).toBeInTheDocument();
  });

  it("steps the day list to the next day via the day-nav arrow", async () => {
    mockFloorPlan();
    const listSpy = vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([]);

    render(<ReservationsClient venueId="v1" initialReservations={[]} rooms={[room]} />);
    await waitFor(() => expect(listSpy).toHaveBeenCalled());
    const callsBefore = listSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /следен ден/i }));
    await waitFor(() => expect(listSpy.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
