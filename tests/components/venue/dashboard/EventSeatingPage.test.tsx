import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { EventSeatingPage, type SeatingActions } from "@/components/venue/dashboard/EventSeatingPage";
import type { EventLayoutElement } from "@/lib/venue/floorplan";
import type { Room, TableType } from "@/lib/venue/rooms";
import type { RoomSeating } from "@/lib/seating/types";

vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const room = { id: "r1", venue_id: "v1", name: "Голема сала", width_cm: 2000, height_cm: 1500 } as Room;
const headType = { id: "tt2", room_id: "r1", name: "Правоаголна 12", shape: "rectangular", seats: 12, width_cm: 600, length_cm: 90, quantity: 2 } as TableType;
const tableType = { id: "tt1", room_id: "r1", name: "Round 4", shape: "round", seats: 4, width_cm: 150, length_cm: 150, quantity: 5 } as TableType;
const table: EventLayoutElement = {
  id: "t1", event_id: "e1", room_id: "r1", element_type: "table", table_type_id: "tt1",
  x_cm: 100, y_cm: 100, width_cm: 150, length_cm: 150, rotation_deg: 0, label: null,
};
const table2: EventLayoutElement = { ...table, id: "t2", x_cm: 400 };
const seating: RoomSeating = {
  tables: [{ elementId: "t1", label: null, number: 1, capacity: 4 }],
  seats: [{ elementId: "t1", seatNumber: 1, guestId: "g1", guestName: null, displayName: "Ана Петровска" }],
  guests: [{ id: "g1", fullName: "Ана Петровска", partySize: 1, seatsTaken: 1, side: null }],
};

function actions(overrides: Partial<SeatingActions> = {}): SeatingActions {
  return {
    listFixedElements: vi.fn().mockResolvedValue([]),
    listLayoutElements: vi.fn().mockResolvedValue([table]),
    initializeFromStandard: vi.fn().mockResolvedValue([table]),
    addElement: vi.fn(),
    moveElement: vi.fn().mockResolvedValue(table),
    resizeElement: vi.fn(),
    rotateElement: vi.fn(),
    deleteElement: vi.fn().mockResolvedValue(undefined),
    revertToStandard: vi.fn(),
    captureSnapshot: vi.fn(),
    undo: vi.fn(),
    getRoomSeating: vi.fn().mockResolvedValue(seating),
    saveTableSeats: vi.fn().mockResolvedValue(seating),
    ...overrides,
  };
}

function renderPage(a: SeatingActions, extra: Partial<Parameters<typeof EventSeatingPage>[0]> = {}) {
  render(
    <EventSeatingPage
      eventId="e1"
      eventName="Ана и Марко"
      room={room}
      initialFixedElements={[]}
      initialLayoutElements={[table]}
      initialTableTypes={[tableType]}
      initialSeating={seating}
      actions={a}
      skipInitialization
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

describe("EventSeatingPage seat lists", () => {
  it("opens the table's numbered list when the table is selected, and saves it", async () => {
    const a = actions();
    renderPage(a);
    selectTable();
    expect(await screen.findByRole("heading", { name: "Маса 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Столче 1")).toHaveValue("Ана Петровска");
    fireEvent.change(screen.getByLabelText("Столче 2"), { target: { value: "Кум Горан" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
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

  it("asks before deleting a table that has seated guests", async () => {
    const a = actions();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPage(a);
    selectTable();
    fireEvent.pointerDown(await screen.findByTestId("floor-plan-delete-t1"));
    expect(confirm).toHaveBeenCalledWith("Масата има 1 седнати гости. Нивните места ќе се ослободат.");
    expect(a.deleteElement).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.pointerDown(screen.getByTestId("floor-plan-delete-t1"));
    await waitFor(() => expect(a.deleteElement).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(a.getRoomSeating).toHaveBeenCalled());
  });

  it("shows the list read-only for venue staff", async () => {
    renderPage(actions({ saveTableSeats: undefined }), { seatingReadOnly: true });
    selectTable();
    expect(await screen.findByText("Ана Петровска")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Зачувај" })).not.toBeInTheDocument();
  });

  it("shows all tables' lists and highlights the picked table on the plan", async () => {
    renderPage(actions());
    fireEvent.click(screen.getByRole("button", { name: "Сите маси" }));
    const card = await screen.findByRole("button", { name: /Маса 1/ });
    fireEvent.click(card);
    expect(screen.getByTestId("floor-plan-element-t1")).toHaveAttribute("data-highlighted", "true");
    fireEvent.click(screen.getByRole("button", { name: "Сите маси" }));
    expect(screen.queryByRole("region", { name: "Сите маси" })).not.toBeInTheDocument();
  });

  it("colours each table by how full it is and explains the colours", () => {
    renderPage(actions());
    const el = screen.getByTestId("floor-plan-element-t1");
    expect(el).toHaveAttribute("data-occupancy", "partial");
    expect(el).toHaveAttribute("fill", "#B7862B");
    expect(screen.getByText("1/4")).toBeInTheDocument();
    const legend = screen.getByRole("list", { name: "Легенда" });
    for (const label of ["Слободна", "Делумно пополнета", "Полна"]) expect(legend).toHaveTextContent(label);
  });

  it("undo and redo follow the server's history state", async () => {
    const a = actions({
      getHistoryState: vi.fn().mockResolvedValueOnce({ canUndo: false, canRedo: false }).mockResolvedValue({ canUndo: true, canRedo: true }),
      undo: vi.fn().mockResolvedValue([table]),
      redo: vi.fn().mockResolvedValue([table]),
    });
    renderPage(a);
    const undo = await screen.findByRole("button", { name: "↶ Врати" });
    await waitFor(() => expect(a.getHistoryState).toHaveBeenCalled());
    expect(undo).toBeDisabled();
    expect(screen.getByRole("button", { name: "↷ Повтори" })).toBeDisabled();

    fireEvent.pointerDown(screen.getByTestId("floor-plan-element-t1"), { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { clientX: 60, clientY: 10 });
    fireEvent.pointerUp(window, { clientX: 60, clientY: 10 });
    await waitFor(() => expect(undo).toBeEnabled());

    fireEvent.click(undo);
    await waitFor(() => expect(a.undo).toHaveBeenCalledWith("e1", "r1"));
    fireEvent.click(screen.getByRole("button", { name: "↷ Повтори" }));
    await waitFor(() => expect(a.redo).toHaveBeenCalledWith("e1", "r1"));

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => expect(a.undo).toHaveBeenCalledTimes(2));
    fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(a.redo).toHaveBeenCalledTimes(2));
  });

  it("groups picked tables and draws one dashed outline with the summed seats", async () => {
    const grouped = [table, table2].map((t) => ({ ...t, group_id: "grp1" }));
    const a = actions({
      listLayoutElements: vi.fn().mockResolvedValue(grouped),
      group: vi.fn().mockResolvedValue(grouped),
      ungroup: vi.fn().mockResolvedValue([table, table2]),
      getHistoryState: vi.fn().mockResolvedValue({ canUndo: true, canRedo: false }),
    });
    renderPage(a, { initialLayoutElements: [table, table2] });
    fireEvent.click(screen.getByRole("button", { name: "+ Групирај маси" }));
    fireEvent.pointerDown(screen.getByTestId("floor-plan-element-t1"));
    fireEvent.pointerDown(screen.getByTestId("floor-plan-element-t2"));
    fireEvent.click(screen.getByRole("button", { name: "Групирај (2)" }));
    await waitFor(() => expect(a.group).toHaveBeenCalledWith("e1", "r1", ["t1", "t2"]));
    const outline = await screen.findByTestId("floor-plan-group-grp1");
    expect(outline.querySelector("rect")).toHaveAttribute("stroke-dasharray");
    expect(outline).toHaveTextContent("Група · 8 места");

    selectTable();
    fireEvent.click(await screen.findByRole("button", { name: "Разгрупирај" }));
    await waitFor(() => expect(a.ungroup).toHaveBeenCalledWith("e1", "r1", "grp1"));
  });

  it("adds a couple table, a head table and hall zones from the palette", async () => {
    const a = actions({ addElement: vi.fn().mockResolvedValue({ ...table, id: "new" }) });
    renderPage(a, { initialTableTypes: [tableType, headType] });
    fireEvent.click(screen.getByRole("button", { name: "+ Маса на младенците" }));
    await waitFor(() =>
      expect(a.addElement).toHaveBeenLastCalledWith(
        expect.objectContaining({ element_type: "table", table_role: "couple", table_type_id: "tt2", width_cm: 600, length_cm: 90 }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Главна маса" }));
    await waitFor(() => expect(a.addElement).toHaveBeenLastCalledWith(expect.objectContaining({ table_role: "head", table_type_id: "tt2" })));
    for (const [name, type] of [["+ Музика", "music"], ["+ Бина за сликање", "photo_stage"], ["+ Танц подиум", "dance_floor"], ["+ Шанк", "bar_movable"]]) {
      fireEvent.click(screen.getByRole("button", { name }));
      await waitFor(() => expect(a.addElement).toHaveBeenLastCalledWith(expect.objectContaining({ element_type: type })));
    }
    // A plain table no longer gets its type's name as a label.
    fireEvent.click(screen.getByRole("button", { name: /\+ Round 4/ }));
    await waitFor(() => expect(a.addElement).toHaveBeenLastCalledWith(expect.objectContaining({ table_type_id: "tt1", label: null, table_role: "guest" })));
  });

  it("renames a table", async () => {
    const a = actions({ relabelElement: vi.fn().mockResolvedValue({ ...table, label: "Кумови" }) });
    renderPage(a);
    selectTable();
    fireEvent.change(await screen.findByLabelText("Ознака на масата"), { target: { value: "Кумови" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај ознака" }));
    await waitFor(() => expect(a.relabelElement).toHaveBeenCalledWith("t1", "Кумови"));
  });

  it("zooms the plan in and out", () => {
    renderPage(actions());
    const svg = screen.getByTestId("floor-plan-canvas");
    const base = Number(svg.getAttribute("width"));
    fireEvent.click(screen.getByRole("button", { name: "Зумирај" }));
    expect(Number(svg.getAttribute("width"))).toBeGreaterThan(base);
    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    expect(Number(svg.getAttribute("width"))).toBe(base);
    fireEvent.click(screen.getByRole("button", { name: "Одзумирај" }));
    expect(Number(svg.getAttribute("width"))).toBeLessThan(base);
  });

  it("links to the printable plan and QR cards", () => {
    renderPage(actions(), { printLinks: { plan: "/venue/events/e1/print/plan", qr: "/venue/events/e1/print/qr" } });
    expect(screen.getByRole("link", { name: "Печати план" })).toHaveAttribute("href", "/venue/events/e1/print/plan");
    expect(screen.getByRole("link", { name: "QR по маса" })).toHaveAttribute("href", "/venue/events/e1/print/qr");
  });

  it("after another device saved the table first, reloads the list and says why", async () => {
    const fresh: RoomSeating = {
      ...seating,
      seats: [{ elementId: "t1", seatNumber: 3, guestId: null, guestName: "Од друг уред", displayName: "Од друг уред" }],
    };
    const a = actions({
      saveTableSeats: vi.fn().mockRejectedValue(new Error("Листата е сменета на друг уред. Освежете ја и обидете се повторно.")),
      getRoomSeating: vi.fn().mockResolvedValue(fresh),
    });
    renderPage(a);
    selectTable();
    fireEvent.change(await screen.findByLabelText("Столче 2"), { target: { value: "Мој" } });
    fireEvent.click(screen.getByRole("button", { name: "Зачувај" }));
    expect(await screen.findByText("Листата е сменета на друг уред. Освежете ја и обидете се повторно.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Столче 3")).toHaveValue("Од друг уред"));
    expect(screen.getByLabelText("Столче 2")).toHaveValue("");
  });
});
