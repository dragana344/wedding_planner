import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ReservationsClient } from "@/components/venue/dashboard/ReservationsClient";
import * as floorplan from "@/lib/venue/floorplan";
import * as rooms from "@/lib/venue/rooms";
import * as reservations from "@/lib/venue/reservations";
import * as events from "@/lib/venue/events";
import * as eventsClient from "@/lib/venue/events-client";
import * as reservationsClient from "@/lib/venue/reservations-client";
import type { Reservation } from "@/lib/venue/reservations";

vi.mock("@/components/venue/shell/ManagerElevationContext", () => ({
  useManagerElevation: () => ({ managerName: "Тест Менаџер", isOwner: false, token: "test-token" }),
  reportElevationRejected: vi.fn(),
}));

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
  server_name: "Ивана",
  event_id: null,
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
  vi.spyOn(reservations, "getTableAvailability").mockResolvedValue({ reserved: [] });
  vi.spyOn(reservations, "listReservationsForRoom").mockResolvedValue([]);
  vi.spyOn(events, "hasFullEventOnDate").mockResolvedValue(false);
}

describe("ReservationsClient", () => {
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
    expect(screen.getAllByRole("link", { name: "WhatsApp" })[0]).toHaveAttribute("href", "https://wa.me/38970111222");
    expect(screen.getAllByRole("link", { name: "Viber" })[0]).toHaveAttribute("href", "viber://forward");
  });

  it("cancelling keeps the reservation: status 'cancelled' through the API, moved into the collapsed history group", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([base]);
    const statusSpy = vi.spyOn(reservationsClient, "setReservationStatusViaApi").mockResolvedValue();
    const deleteSpy = vi.spyOn(reservationsClient, "deleteReservationViaApi").mockResolvedValue();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ReservationsClient venueId="v1" initialReservations={[base]} rooms={[room]} />);
    await screen.findByText("Ana Ivanova");
    fireEvent.click(screen.getByRole("button", { name: /откажи/i }));
    await waitFor(() => expect(statusSpy).toHaveBeenCalledWith("res1", "cancelled", "test-token"));
    expect(confirmSpy).toHaveBeenCalledWith(
      "Да се откаже резервацијата на Ana Ivanova? Масите се ослободуваат, а резервацијата останува во списокот како откажана.",
    );
    expect(deleteSpy).not.toHaveBeenCalled();
    // Out of the live list (and its count), into "Откажани / завршени".
    await waitFor(() => expect(screen.queryByText("Ana Ivanova")).not.toBeInTheDocument());
    expect(screen.getByText("0 резервации")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Откажани / завршени (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByText("Ana Ivanova")).toBeInTheDocument();
    expect(screen.getByText("Откажана")).toBeInTheDocument();
  });

  it("tags a mini-event's row; cancelling it cancels the event (no delete) and offers no hard delete (Project B §6)", async () => {
    mockFloorPlan();
    const miniRow = { ...base, id: "mini1", event_id: "e1", guest_name: "Iva's Birthday" };
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([miniRow]);
    const statusSpy = vi.spyOn(reservationsClient, "setReservationStatusViaApi").mockResolvedValue();
    const deleteEventSpy = vi.spyOn(eventsClient, "deleteEventViaApi").mockResolvedValue();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ReservationsClient venueId="v1" initialReservations={[miniRow]} rooms={[room]} />);
    await screen.findByText("Iva's Birthday");
    expect(screen.getByText("Мини настан")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /откажи/i }));
    await waitFor(() => expect(statusSpy).toHaveBeenCalledWith("mini1", "cancelled", "test-token"));
    expect(confirmSpy.mock.calls[0][0]).toContain("ќе биде означен како откажан");
    expect(confirmSpy.mock.calls[0][0]).not.toContain("брише");
    expect(deleteEventSpy).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "Откажани / завршени (1)" }));
    expect(screen.getByText("Iva's Birthday")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Избриши засекогаш" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Врати" })).not.toBeInTheDocument();
  });

  it("keeps the reservation when the cancel question is declined", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([base]);
    const statusSpy = vi.spyOn(reservationsClient, "setReservationStatusViaApi").mockResolvedValue();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ReservationsClient venueId="v1" initialReservations={[base]} rooms={[room]} />);
    await screen.findByText("Ana Ivanova");
    fireEvent.click(screen.getByRole("button", { name: /откажи/i }));
    expect(statusSpy).not.toHaveBeenCalled();
    expect(screen.getByText("Ana Ivanova")).toBeInTheDocument();
  });

  it("moves reserved -> seated, then 'guests left' marks it completed (kept, not deleted)", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([base]);
    const statusSpy = vi.spyOn(reservationsClient, "setReservationStatusViaApi").mockResolvedValue();
    const deleteSpy = vi.spyOn(reservationsClient, "deleteReservationViaApi").mockResolvedValue();

    render(<ReservationsClient venueId="v1" initialReservations={[base]} rooms={[room]} />);
    await screen.findByText("Ana Ivanova");

    fireEvent.click(screen.getByRole("button", { name: /^зафатена$/i }));
    await waitFor(() => expect(statusSpy).toHaveBeenCalledWith("res1", "seated", "test-token"));
    expect(await screen.findByText("Слободна", { selector: "button" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^слободна$/i }));
    await waitFor(() => expect(statusSpy).toHaveBeenCalledWith("res1", "completed", "test-token"));
    expect(deleteSpy).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Откажани / завршени (1)" }));
    expect(screen.getByText("Завршена")).toBeInTheDocument();
  });

  it("doesn't count cancelled or completed bookings in the stat tiles", () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([]);
    render(
      <ReservationsClient
        venueId="v1"
        initialReservations={[base, { ...base, id: "c", status: "cancelled" }, { ...base, id: "d", status: "completed" }]}
        rooms={[room]}
      />
    );
    const tile = screen.getByText("Вкупно").closest(".tile")!;
    expect(tile).toHaveTextContent("1");
  });

  it("hard-deletes a cancelled reservation only after a confirm that names it", async () => {
    mockFloorPlan();
    const cancelled = { ...base, status: "cancelled" as const };
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([cancelled]);
    const deleteSpy = vi.spyOn(reservationsClient, "deleteReservationViaApi").mockResolvedValue();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

    render(<ReservationsClient venueId="v1" initialReservations={[cancelled]} rooms={[room]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Откажани / завршени (1)" }));
    // A past cancelled booking can't be restored, only removed.
    expect(screen.queryByRole("button", { name: "Врати" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Избриши засекогаш" }));
    expect(confirmSpy).toHaveBeenLastCalledWith(
      "Да се избрише засекогаш резервацијата на Ana Ivanova (01.11.2026, 19:00, 4 гости)? Ова не може да се врати.",
    );
    expect(deleteSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Избриши засекогаш" }));
    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith("res1", "test-token"));
    await waitFor(() => expect(screen.queryByText("Ana Ivanova")).not.toBeInTheDocument());
  });

  it("restores an upcoming cancelled reservation with 'Врати'", async () => {
    mockFloorPlan();
    const upcoming = { ...base, date: "2099-01-01", status: "cancelled" as const };
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([upcoming]);
    const statusSpy = vi.spyOn(reservationsClient, "setReservationStatusViaApi").mockResolvedValue();

    render(<ReservationsClient venueId="v1" initialReservations={[upcoming]} rooms={[room]} />);
    fireEvent.click(await screen.findByRole("button", { name: "Откажани / завршени (1)" }));
    fireEvent.click(screen.getByRole("button", { name: "Врати" }));
    await waitFor(() => expect(statusSpy).toHaveBeenCalledWith("res1", "reserved", "test-token"));
    expect(await screen.findByText("1 резервации")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Откажани \/ завршени/ })).not.toBeInTheDocument();
  });

  it("shows the server's message when a status change is refused", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([base]);
    vi.spyOn(reservationsClient, "setReservationStatusViaApi").mockRejectedValue(new Error("Потребна е најава како менаџер."));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ReservationsClient venueId="v1" initialReservations={[base]} rooms={[room]} />);
    await screen.findByText("Ana Ivanova");
    fireEvent.click(screen.getByRole("button", { name: /откажи/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Потребна е најава како менаџер.");
    expect(screen.getByText("Ana Ivanova")).toBeInTheDocument();
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

describe("ReservationsClient on a phone", () => {
  const desktopMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = ((query: string) => ({ ...desktopMatchMedia(query), matches: true })) as typeof window.matchMedia;
    return () => {
      window.matchMedia = desktopMatchMedia;
    };
  });

  it("shows each reservation as one line; tapping it opens the contact and the actions", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([base]);
    render(<ReservationsClient venueId="v1" initialReservations={[base]} rooms={[room]} />);

    const row = await screen.findByRole("button", { name: `${base.start_time.slice(0, 5)} Ana Ivanova: детали` });
    expect(row).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link", { name: "WhatsApp" }).length).toBeGreaterThan(1);
  });

  it("opens the booking window from 'Нова резервација' and closes it again", async () => {
    mockFloorPlan();
    vi.spyOn(reservations, "listReservationsForDate").mockResolvedValue([]);
    render(<ReservationsClient venueId="v1" initialReservations={[]} rooms={[room]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Нова резервација" }));
    expect(screen.getByRole("dialog", { name: "Нова резервација" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Затвори" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
