import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { EventSeatingPage, type SeatingActions } from "@/components/venue/dashboard/EventSeatingPage";
import type { EventLayoutElement } from "@/lib/venue/floorplan";
import type { Room, TableType } from "@/lib/venue/rooms";
import type { RoomSeating } from "@/lib/seating/types";

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const room = { id: "r1", venue_id: "v1", name: "Голема сала", width_cm: 2000, height_cm: 1500 } as Room;
const tableType = { id: "tt1", room_id: "r1", name: "Round 4", shape: "round", seats: 4, width_cm: 150, length_cm: 150, quantity: 5 } as TableType;
const table: EventLayoutElement = {
  id: "t1", event_id: "e1", room_id: "r1", element_type: "table", table_type_id: "tt1",
  x_cm: 100, y_cm: 100, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null,
};
const seating: RoomSeating = {
  tables: [{ elementId: "t1", label: null, number: 1, capacity: 4 }],
  seats: [{ elementId: "t1", seatNumber: 1, guestId: "g1", guestName: null, displayName: "Ана Петровска" }],
  guests: [
    { id: "g1", fullName: "Ана Петровска", partySize: 1, seatsTaken: 1, side: null },
    { id: "g2", fullName: "Игор Стојанов", partySize: 1, seatsTaken: 0, side: null },
  ],
};

function actions(overrides: Partial<SeatingActions> = {}): SeatingActions {
  return {
    listFixedElements: vi.fn().mockResolvedValue([]),
    listLayoutElements: vi.fn().mockResolvedValue([table]),
    initializeFromStandard: vi.fn().mockResolvedValue([table]),
    addElement: vi.fn().mockResolvedValue({ ...table, id: "new" }),
    moveElement: vi.fn().mockResolvedValue(table),
    resizeElement: vi.fn(),
    rotateElement: vi.fn(),
    relabelElement: vi.fn().mockResolvedValue(table),
    deleteElement: vi.fn().mockResolvedValue(undefined),
    revertToStandard: vi.fn(),
    captureSnapshot: vi.fn(),
    undo: vi.fn(),
    getRoomSeating: vi.fn().mockResolvedValue(seating),
    saveTableSeats: vi.fn().mockResolvedValue(seating),
    moveSeat: vi.fn().mockResolvedValue(seating),
    confirm: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPage(a: SeatingActions, extra: Partial<Parameters<typeof EventSeatingPage>[0]> = {}) {
  render(
    <EventSeatingPage
      eventId="e1"
      eventName="Марко и Ана"
      room={room}
      initialFixedElements={[]}
      initialLayoutElements={[table]}
      initialTableTypes={[tableType]}
      initialSeating={seating}
      actions={a}
      skipInitialization
      printLinks={{ plan: "/couple/seating/print", qr: "/couple/seating/print?view=qr" }}
      look="couple"
      {...extra}
    />,
  );
}

function selectTable() {
  fireEvent.pointerDown(screen.getByTestId("floor-plan-element-t1"), { clientX: 10, clientY: 10 });
  fireEvent.pointerUp(window, { clientX: 10, clientY: 10 });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("EventSeatingPage — couple look", () => {
  it("shows the title header, seat count, print links and the legend", () => {
    renderPage(actions());
    expect(screen.getByRole("heading", { name: "Голема сала — Распоред на седење" })).toBeInTheDocument();
    expect(screen.getByText("Марко и Ана")).toBeInTheDocument();
    expect(screen.getByText("4 седишта")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Печати план" })).toHaveAttribute("href", "/couple/seating/print");
    expect(screen.getByRole("link", { name: "QR по маса" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Легенда" })).toHaveTextContent("Делумно пополнета");
  });

  it("adds elements and tables from the one drop-down menu", async () => {
    const a = actions();
    renderPage(a);
    fireEvent.click(screen.getByRole("button", { name: "Додај елемент" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Бина" }));
    await waitFor(() => expect(a.addElement).toHaveBeenCalledWith(expect.objectContaining({ element_type: "stage" })));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Додај елемент" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Round 4 (1/5)" }));
    await waitFor(() => expect(a.addElement).toHaveBeenCalledWith(expect.objectContaining({ table_type_id: "tt1" })));
  });

  it("lists guests in the sidebar and the selected table's seats, saving a cleared seat at once", async () => {
    const a = actions();
    renderPage(a);
    expect(screen.getByRole("button", { name: "Повлечи Игор Стојанов" })).toBeInTheDocument();
    expect(screen.getByText(/Изберете маса на планот/)).toBeInTheDocument();

    selectTable();
    expect(await screen.findByRole("heading", { name: "Маса 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Столче 2")).toHaveAttribute("placeholder", "Слободно");
    expect(screen.queryByRole("button", { name: "Зачувај" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ослободи седиште 1" }));
    await waitFor(() => expect(a.saveTableSeats).toHaveBeenCalledWith("r1", "t1", [], [{ seatNumber: 1, guestId: "g1", guestName: null }]));
  });

  it("saves a typed name when the seat field is left", async () => {
    const a = actions();
    renderPage(a);
    selectTable();
    const field = await screen.findByLabelText("Столче 2");
    fireEvent.change(field, { target: { value: "Кум Горан" } });
    fireEvent.blur(field);
    await waitFor(() =>
      expect(a.saveTableSeats).toHaveBeenCalledWith(
        "r1",
        "t1",
        [
          { seatNumber: 1, guestId: "g1", guestName: null },
          { seatNumber: 2, guestId: null, guestName: "Кум Горан" },
        ],
        [{ seatNumber: 1, guestId: "g1", guestName: null }],
      ),
    );
  });

  it("shows the table's details and renames it from the second tab", async () => {
    const a = actions();
    renderPage(a);
    selectTable();
    fireEvent.click(screen.getByRole("tab", { name: "Детали за маса" }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Round 4")).toBeInTheDocument();
    expect(within(panel).getByText("1/4 · Делумно пополнета")).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Ознака на масата"), { target: { value: "Кумови" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Зачувај ознака" }));
    await waitFor(() => expect(a.relabelElement).toHaveBeenCalledWith("t1", "Кумови"));
  });

  it("План / Листа на маси switch: one view at a time, a picked card becomes the selected table", async () => {
    renderPage(actions());
    expect(screen.getByRole("button", { name: "План" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("floor-plan-canvas")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Сите маси" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Листа на маси" }));
    expect(screen.getByRole("button", { name: "Листа на маси" })).toHaveAttribute("aria-pressed", "true");
    const list = screen.getByRole("region", { name: "Сите маси" });
    expect(list).toHaveTextContent("1. Ана Петровска");
    // The list takes the plan's and the sidebar's place.
    expect(screen.queryByTestId("floor-plan-canvas")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Гости" })).not.toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: /Маса 1/ }));

    fireEvent.click(screen.getByRole("button", { name: "План" }));
    expect(screen.queryByRole("region", { name: "Сите маси" })).not.toBeInTheDocument();
    expect(screen.getByTestId("floor-plan-canvas")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Маса 1" })).toBeInTheDocument();
  });

  it("hides every editing tool when view-only, and says why", () => {
    renderPage(actions(), { viewOnly: true, viewOnlyNotice: "Салата го заклучи распоредот." });
    expect(screen.getByRole("status")).toHaveTextContent("Салата го заклучи распоредот.");
    for (const name of ["Додај елемент", "Врати", "Првичен распоред", "Испрати распоред на локалот"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Повлечи Игор Стојанов" })).not.toBeInTheDocument();
  });

  it("sends the draft to the venue from the header", async () => {
    const a = actions();
    renderPage(a);
    fireEvent.click(screen.getByRole("button", { name: "Испрати распоред на локалот" }));
    await waitFor(() => expect(a.confirm).toHaveBeenCalledWith("e1", "r1"));
  });
});
