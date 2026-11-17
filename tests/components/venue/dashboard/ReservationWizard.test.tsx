import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ReservationWizard } from "@/components/venue/dashboard/ReservationWizard";
import * as floorplan from "@/lib/venue/floorplan";
import * as rooms from "@/lib/venue/rooms";
import * as reservations from "@/lib/venue/reservations";
import * as events from "@/lib/venue/events";
import type { Reservation } from "@/lib/venue/reservations";

const room = { id: "r1", venue_id: "v1", name: "Hall", width_cm: 2000, height_cm: 1500, tableTypeCount: 1, seatTotal: 16 };

const busy: Reservation = {
  id: "x1",
  venue_id: "v1",
  room_id: "r1",
  guest_name: "Друг",
  phone: "070",
  email: null,
  date: "2026-11-01",
  start_time: "20:00",
  end_time: "22:00",
  party_size: 2,
  status: "reserved",
  event_type: null,
  note: null,
  server_name: "Ивана",
  event_id: null,
  table_ids: ["t2"],
};

function table(id: string, x: number) {
  return { id, room_id: "r1", element_type: "table" as const, table_type_id: "tt1", x_cm: x, y_cm: 100, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null, created_at: "2026-01-01T00:00:00Z" };
}

function mockRoom({ reservedNow = [] as string[], fullEvent = false, dayReservations = [] as Reservation[] } = {}) {
  vi.spyOn(floorplan, "listFixedElements").mockResolvedValue([]);
  vi.spyOn(floorplan, "listRoomLayoutElements").mockResolvedValue([table("t1", 100), table("t2", 400)]);
  vi.spyOn(rooms, "listTableTypes").mockResolvedValue([
    { id: "tt1", room_id: "r1", name: "Round-8", shape: "round", seats: 8, width_cm: 150, length_cm: 150, quantity: 5 },
  ]);
  vi.spyOn(reservations, "getTableAvailability").mockResolvedValue({ reserved: reservedNow });
  vi.spyOn(reservations, "listReservationsForRoom").mockResolvedValue(dayReservations);
  vi.spyOn(events, "hasFullEventOnDate").mockResolvedValue(fullEvent);
}

function renderWizard(onCreated = vi.fn(), onClose = vi.fn()) {
  render(<ReservationWizard venueId="v1" rooms={[room]} logoUrl={null} onCreated={onCreated} onClose={onClose} />);
  return { onCreated, onClose };
}

const next = () => fireEvent.click(screen.getByRole("button", { name: /Понатаму/ }));

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ReservationWizard (new table reservation in 3 steps)", () => {
  it("books a table: when + how many → table → guest, and hands back the created reservation", async () => {
    mockRoom();
    const created = { ...busy, id: "new", guest_name: "Ана", table_ids: ["t1"] };
    const createSpy = vi.spyOn(reservations, "createReservation").mockResolvedValue(created);
    const { onCreated } = renderWizard();

    fireEvent.click(screen.getByRole("button", { name: /^20:00/ }));
    fireEvent.click(screen.getByRole("button", { name: "Еден гостин повеќе" }));
    next();

    const t1 = await screen.findByRole("button", { name: /Маса 1/ });
    // Nothing picked yet: can't go on.
    expect(screen.getByRole("button", { name: /Понатаму/ })).toBeDisabled();
    fireEvent.click(t1);
    expect(t1).toHaveAttribute("aria-pressed", "true");
    next();

    expect(screen.getByText(/20:00 · 3 гости · Hall · Маса 1/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Ана" } });
    fireEvent.change(screen.getByLabelText("Телефон"), { target: { value: "070111222" } });
    fireEvent.change(screen.getByLabelText(/Келнер/), { target: { value: "Стефан" } });
    fireEvent.click(screen.getByRole("button", { name: "Резервирај" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    const call = createSpy.mock.calls[0][0];
    expect(call).toMatchObject({ start_time: "20:00", party_size: 3, table_ids: ["t1"], guest_name: "Ана", server_name: "Стефан" });
  });

  it("shows free tables per time, the busiest-hour count, and a note for a full event", async () => {
    mockRoom({ fullEvent: true, dayReservations: [busy] });
    renderWizard();
    expect(await screen.findByRole("button", { name: /^20:00\s*1 слободни/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^11:00\s*2 слободни/ })).toBeInTheDocument();
    expect(await screen.findByText(/1 од 2 маси зафатени/)).toBeInTheDocument();
    expect(await screen.findByText("Овој датум има настан со целосен капацитет во оваа сала.")).toBeInTheDocument();
  });

  it("lists a taken table as Зафатена and doesn't let it be picked", async () => {
    mockRoom({ reservedNow: ["t2"] });
    renderWizard();
    next();
    const t2 = await screen.findByRole("button", { name: /Маса 2.*Зафатена/ });
    expect(t2).toBeDisabled();
    expect(screen.getByText(/1 од 2 маси слободни/)).toBeInTheDocument();
  });

  it("asks for the waiter on the field itself before sending anything", async () => {
    mockRoom();
    const createSpy = vi.spyOn(reservations, "createReservation");
    renderWizard();
    next();
    fireEvent.click(await screen.findByRole("button", { name: /Маса 1/ }));
    next();
    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Ана" } });
    fireEvent.change(screen.getByLabelText("Телефон"), { target: { value: "070111222" } });
    fireEvent.click(screen.getByRole("button", { name: "Резервирај" }));
    await waitFor(() => expect(screen.getByLabelText(/Келнер/)).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByRole("alert")).toHaveTextContent("Внесете кој келнер ја прави резервацијата.");
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("shows the server's conflict message and stays open", async () => {
    mockRoom();
    vi.spyOn(reservations, "createReservation").mockRejectedValue(new Error("Една или повеќе од избраните маси се веќе резервирани за тоа време."));
    const { onCreated } = renderWizard();
    next();
    fireEvent.click(await screen.findByRole("button", { name: /Маса 1/ }));
    next();
    fireEvent.change(screen.getByLabelText("Име и презиме"), { target: { value: "Ана" } });
    fireEvent.change(screen.getByLabelText("Телефон"), { target: { value: "070" } });
    fireEvent.change(screen.getByLabelText(/Келнер/), { target: { value: "Стефан" } });
    fireEvent.click(screen.getByRole("button", { name: "Резервирај" }));
    expect(await screen.findByText(/веќе резервирани/)).toBeInTheDocument();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("says when the room could not load, and retries", async () => {
    mockRoom();
    const layoutSpy = vi.spyOn(floorplan, "listRoomLayoutElements").mockRejectedValueOnce(new Error("network"));
    renderWizard();
    expect(await screen.findByText("Податоците за салата не можеа да се вчитаат.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Обиди се повторно" }));
    await waitFor(() => expect(layoutSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Податоците за салата не можеа да се вчитаат.")).not.toBeInTheDocument());
  });

  it("closes on Escape and from Откажи", () => {
    mockRoom();
    const { onClose } = renderWizard();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Откажи" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
