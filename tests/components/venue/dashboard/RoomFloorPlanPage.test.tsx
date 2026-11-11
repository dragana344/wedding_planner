import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Room, TableType } from "@/lib/venue/rooms";
import type { RoomLayoutElement } from "@/lib/venue/floorplan";

const lib = vi.hoisted(() => ({
  addFixedElement: vi.fn(),
  addRoomLayoutElement: vi.fn(),
  listFixedElements: vi.fn(),
  listRoomLayoutElements: vi.fn(),
  verifyLayoutLockPassword: vi.fn(),
}));
const presetsLib = vi.hoisted(() => ({
  listRoomPresets: vi.fn(),
  saveRoomPreset: vi.fn(),
  loadRoomPreset: vi.fn(),
}));
const historyLib = vi.hoisted(() => ({
  recordAroundRoom: vi.fn((_roomId: string, edit: () => Promise<unknown>) => edit()),
  undoRoomStep: vi.fn(),
  redoRoomStep: vi.fn(),
  roomHistoryStepState: vi.fn(),
}));
const elevation = vi.hoisted(() => ({ managerName: "Тест Менаџер" as string | null }));
const profileLib = vi.hoisted(() => ({ getVenueLogoUrl: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const roomsLib = vi.hoisted(() => ({
  listTableTypes: vi.fn(),
  upsertTableType: vi.fn(),
  updateTableType: vi.fn(),
  seatsAffectedByTableType: vi.fn(),
  updateRoomName: vi.fn(),
  deleteRoom: vi.fn(),
  deleteTableType: vi.fn(),
  roomUsage: vi.fn(),
}));

vi.mock("@/lib/venue/floorplan", async (importOriginal) => ({ ...(await importOriginal<object>()), ...lib }));
vi.mock("@/lib/venue/rooms", async (importOriginal) => ({ ...(await importOriginal<object>()), ...roomsLib }));
vi.mock("@/lib/venue/room-presets", () => presetsLib);
vi.mock("@/lib/venue/room-layout-history", () => historyLib);
vi.mock("@/lib/venue/venue-profile", () => profileLib);
vi.mock("@/components/venue/shell/ManagerElevationContext", () => ({
  useManagerElevation: () => ({ managerName: elevation.managerName, isOwner: false, token: elevation.managerName ? "test-token" : null }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { RoomFloorPlanPage } from "@/components/venue/dashboard/RoomFloorPlanPage";

const room = { id: "r1", venue_id: "v1", name: "Голема сала", width_cm: 2000, height_cm: 1500 } as Room;
const otherRoom = { id: "r2", venue_id: "v1", name: "Тераса", width_cm: 1000, height_cm: 900 } as Room;
const round = { id: "tt1", room_id: "r1", name: "Округла 10", shape: "round", seats: 10, width_cm: 180, length_cm: 180, quantity: 41 } as TableType;
const rect = { id: "tt2", room_id: "r1", name: "Главна 12", shape: "rectangular", seats: 12, width_cm: 600, length_cm: 90, quantity: 1 } as TableType;

function el(id: string, extra: Partial<RoomLayoutElement>): RoomLayoutElement {
  return {
    id, room_id: "r1", element_type: "table", table_type_id: "tt1", x_cm: 0, y_cm: 0, width_cm: 180, length_cm: 180,
    rotation_deg: 0, label: null, created_at: `2027-01-01T00:00:0${id.slice(-1)}Z`, table_role: "guest", ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  elevation.managerName = "Тест Менаџер";
  lib.listFixedElements.mockResolvedValue([]);
  lib.listRoomLayoutElements.mockResolvedValue([]);
  lib.addFixedElement.mockResolvedValue({ id: "f1" });
  lib.addRoomLayoutElement.mockResolvedValue({ id: "n1" });
  lib.verifyLayoutLockPassword.mockResolvedValue(true);
  roomsLib.upsertTableType.mockResolvedValue({ id: "tt3", room_id: "r1", name: "Нова-6", shape: "round", seats: 6, width_cm: 120, length_cm: 120, quantity: 2 });
  roomsLib.listTableTypes.mockResolvedValue([round, rect]);
  roomsLib.updateRoomName.mockResolvedValue({ ...room, name: "Нова сала" });
  roomsLib.deleteRoom.mockResolvedValue(undefined);
  roomsLib.deleteTableType.mockResolvedValue(undefined);
  roomsLib.seatsAffectedByTableType.mockResolvedValue(0);
  roomsLib.roomUsage.mockResolvedValue({ events: 0, reservations: 0 });
  presetsLib.listRoomPresets.mockResolvedValue([]);
  profileLib.getVenueLogoUrl.mockResolvedValue(null);
  historyLib.recordAroundRoom.mockImplementation((_roomId: string, edit: () => Promise<unknown>) => edit());
  historyLib.roomHistoryStepState.mockResolvedValue({ canUndo: false, canRedo: false });
  vi.stubGlobal("confirm", vi.fn(() => true));
});

function renderPage(layout: RoomLayoutElement[] = []) {
  return render(
    <RoomFloorPlanPage
      venueId="v1"
      room={room}
      rooms={[room, otherRoom]}
      initialFixedElements={[]}
      initialLayoutElements={layout}
      initialTableTypes={[round, rect]}
    />,
  );
}

async function unlock() {
  const code = screen.getByLabelText(/Отклучи фиксен распоред/);
  fireEvent.change(code, { target: { value: "1234" } });
  fireEvent.submit(code.closest("form")!);
  await screen.findByRole("button", { name: "Влез" });
}

describe("RoomFloorPlanPage palette (B4)", () => {
  it("adds couple and head tables, music and a photo stage", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Маса на младенците" }));
    await waitFor(() =>
      expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(
        expect.objectContaining({ element_type: "table", table_role: "couple", table_type_id: "tt2" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Главна маса" }));
    await waitFor(() => expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(expect.objectContaining({ table_role: "head" })));
    fireEvent.click(screen.getByRole("button", { name: "Маса за музика/фотографи" }));
    await waitFor(() => expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(expect.objectContaining({ table_role: "crew" })));
    fireEvent.click(screen.getByRole("button", { name: "Музика" }));
    await waitFor(() => expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(expect.objectContaining({ element_type: "music" })));
    fireEvent.click(screen.getByRole("button", { name: "Бина за сликање" }));
    await waitFor(() => expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(expect.objectContaining({ element_type: "photo_stage" })));
    fireEvent.click(screen.getByRole("button", { name: /Округла 10 \(/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Користи во распоредот" }));
    await waitFor(() => expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(expect.objectContaining({ table_type_id: "tt1", label: null })));
  });

  it("'Друго' opens a form to add a brand new table type, which then appears in the palette", async () => {
    roomsLib.listTableTypes.mockResolvedValue([round, rect, { id: "tt3", room_id: "r1", name: "Нова-6", shape: "round", seats: 6, width_cm: 120, length_cm: 120, quantity: 2 }]);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Друго" }));
    fireEvent.change(screen.getByLabelText(/Име на видот маса/), { target: { value: "Нова-6" } });
    fireEvent.submit(screen.getByRole("button", { name: "Зачувај вид маса" }).closest("form")!);
    expect(await screen.findByRole("button", { name: /Нова-6 \(/ })).toBeInTheDocument();
  });

  it("'Друго' → Декорација places a single shaped element with no seats, not a reusable type", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Друго" }));
    fireEvent.click(screen.getByRole("tab", { name: "Декорација (без столчиња)" }));
    fireEvent.change(screen.getByLabelText(/^Име/), { target: { value: "Цвеќиња" } });
    fireEvent.click(screen.getByRole("button", { name: "Додај" }));
    await waitFor(() =>
      expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(
        expect.objectContaining({ element_type: "other", label: "Цвеќиња", shape: "round", width_cm: 60, length_cm: 60 }),
      ),
    );
    expect(roomsLib.upsertTableType).not.toHaveBeenCalled();
  });

  it("adds an entrance and a WC once the layout is unlocked", async () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "Влез" })).not.toBeInTheDocument();
    await unlock();
    fireEvent.click(await screen.findByRole("button", { name: "Влез" }));
    await waitFor(() => expect(lib.addFixedElement).toHaveBeenLastCalledWith(expect.objectContaining({ element_type: "entrance" })));
    fireEvent.click(screen.getByRole("button", { name: "WC" }));
    await waitFor(() => expect(lib.addFixedElement).toHaveBeenLastCalledWith(expect.objectContaining({ element_type: "wc" })));
  });

  describe("manager-only fixed layout unlock", () => {
    it("hides the unlock control entirely for a plain staff session", () => {
      elevation.managerName = null;
      renderPage();
      expect(screen.queryByLabelText(/Отклучи фиксен распоред/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Влез" })).not.toBeInTheDocument();
    });

    it("shows the unlock control for an elevated manager", () => {
      renderPage();
      expect(screen.getByLabelText(/Отклучи фиксен распоред/)).toBeInTheDocument();
    });
  });

  describe("room presets (0135, Project A §2)", () => {
    it("lets a plain staff session (no manager elevation) load a saved preset without unlocking", async () => {
      elevation.managerName = null;
      presetsLib.listRoomPresets.mockResolvedValue([{ id: "p1", room_id: "r1", name: "Стандарден", created_at: "x", updated_at: "x" }]);
      presetsLib.loadRoomPreset.mockResolvedValue(undefined);
      renderPage();
      fireEvent.change(await screen.findByLabelText("Зачувани планови"), { target: { value: "p1" } });
      fireEvent.click(screen.getByRole("button", { name: "Вчитај план" }));
      await waitFor(() => expect(presetsLib.loadRoomPreset).toHaveBeenCalledWith("p1", "r1"));
      // Saving a new preset still requires the manager unlock, invisible here.
      expect(screen.queryByLabelText(/Зачувај го тековниот распоред/)).not.toBeInTheDocument();
    });

    it("saves the current layout as a named preset (manager, unlocked)", async () => {
      presetsLib.saveRoomPreset.mockResolvedValue({ id: "p1", room_id: "r1", name: "Стандарден", created_at: "x", updated_at: "x" });
      renderPage();
      await unlock();
      fireEvent.change(screen.getByLabelText(/Зачувај го тековниот распоред/), { target: { value: "Стандарден" } });
      fireEvent.submit(screen.getByRole("button", { name: "Зачувај план" }).closest("form")!);
      await waitFor(() => expect(presetsLib.saveRoomPreset).toHaveBeenCalledWith("r1", "Стандарден"));
      expect(await screen.findByText("Планот е зачуван.")).toBeInTheDocument();
    });

    it("refuses an empty preset name without calling the save function", async () => {
      renderPage();
      await unlock();
      fireEvent.submit(screen.getByRole("button", { name: "Зачувај план" }).closest("form")!);
      expect(await screen.findByText("Внесете име за планот.")).toBeInTheDocument();
      expect(presetsLib.saveRoomPreset).not.toHaveBeenCalled();
    });

    it("lists saved presets and loads the selected one after confirming", async () => {
      presetsLib.listRoomPresets.mockResolvedValue([
        { id: "p1", room_id: "r1", name: "Стандарден", created_at: "x", updated_at: "x" },
        { id: "p2", room_id: "r1", name: "Свечен", created_at: "x", updated_at: "x" },
      ]);
      presetsLib.loadRoomPreset.mockResolvedValue(undefined);
      renderPage();
      fireEvent.change(await screen.findByLabelText("Зачувани планови"), { target: { value: "p2" } });
      fireEvent.click(screen.getByRole("button", { name: "Вчитај план" }));
      expect(window.confirm).toHaveBeenCalled();
      await waitFor(() => expect(presetsLib.loadRoomPreset).toHaveBeenCalledWith("p2", "r1"));
    });

    it("does nothing when the load confirmation is declined", async () => {
      vi.stubGlobal("confirm", vi.fn(() => false));
      presetsLib.listRoomPresets.mockResolvedValue([{ id: "p1", room_id: "r1", name: "Стандарден", created_at: "x", updated_at: "x" }]);
      renderPage();
      fireEvent.change(await screen.findByLabelText("Зачувани планови"), { target: { value: "p1" } });
      fireEvent.click(screen.getByRole("button", { name: "Вчитај план" }));
      expect(presetsLib.loadRoomPreset).not.toHaveBeenCalled();
    });

    it("shows the reservation-blocking error when a load is refused", async () => {
      presetsLib.listRoomPresets.mockResolvedValue([{ id: "p1", room_id: "r1", name: "Стандарден", created_at: "x", updated_at: "x" }]);
      presetsLib.loadRoomPreset.mockRejectedValue(new Error("Постојат резервации за моментално поставените маси. Откажете ги или преместете ги пред да вчитате друг план."));
      renderPage();
      fireEvent.change(await screen.findByLabelText("Зачувани планови"), { target: { value: "p1" } });
      fireEvent.click(screen.getByRole("button", { name: "Вчитај план" }));
      expect(await screen.findByText(/Постојат резервации/)).toBeInTheDocument();
    });
  });

  describe("undo/redo", () => {
    it("starts disabled, then enables undo after an edit and calls undoRoomStep on click", async () => {
      renderPage();
      const undoBtn = await screen.findByRole("button", { name: "← Назад" });
      const redoBtn = screen.getByRole("button", { name: "Напред →" });
      expect(undoBtn).toBeDisabled();
      expect(redoBtn).toBeDisabled();

      historyLib.roomHistoryStepState.mockResolvedValue({ canUndo: true, canRedo: false });
      fireEvent.click(screen.getByRole("button", { name: "Музика" }));
      await waitFor(() => expect(undoBtn).not.toBeDisabled());

      historyLib.undoRoomStep.mockResolvedValue({ elements: [], fixed: [] });
      fireEvent.click(undoBtn);
      await waitFor(() => expect(historyLib.undoRoomStep).toHaveBeenCalledWith("r1"));
    });

    it("calls redoRoomStep on click when enabled", async () => {
      historyLib.roomHistoryStepState.mockResolvedValue({ canUndo: false, canRedo: true });
      historyLib.redoRoomStep.mockResolvedValue({ elements: [], fixed: [] });
      renderPage();
      const redoBtn = await screen.findByRole("button", { name: "Напред →" });
      await waitFor(() => expect(redoBtn).not.toBeDisabled());
      fireEvent.click(redoBtn);
      await waitFor(() => expect(historyLib.redoRoomStep).toHaveBeenCalledWith("r1"));
    });

    it("surfaces an error message when undo fails (e.g. nothing to undo)", async () => {
      historyLib.roomHistoryStepState.mockResolvedValue({ canUndo: true, canRedo: false });
      historyLib.undoRoomStep.mockRejectedValue(new Error("Нема што да се врати."));
      renderPage();
      const undoBtn = await screen.findByRole("button", { name: "← Назад" });
      await waitFor(() => expect(undoBtn).not.toBeDisabled());
      fireEvent.click(undoBtn);
      expect(await screen.findByText("Нема што да се врати.")).toBeInTheDocument();
    });
  });

  it("numbers guest tables only and names the couple's table", () => {
    renderPage([el("t1", { table_role: "couple", table_type_id: "tt2" }), el("t2", {}), el("t3", {})]);
    // A label long enough to wrap onto two lines inside the table (one
    // <tspan> per line) is no longer one plain text node — rejoin the lines
    // before comparing.
    function labelOf(testId: string): string {
      const text = screen.getByTestId(testId).closest("g")!.querySelector("text")!;
      const tspans = text.querySelectorAll("tspan");
      return tspans.length > 0 ? Array.from(tspans).map((t) => t.textContent).join(" ") : (text.textContent ?? "");
    }
    expect(labelOf("floor-plan-element-t1")).toBe("Маса на младенците");
    expect(labelOf("floor-plan-element-t2")).toBe("Маса 1 (10)");
    expect(labelOf("floor-plan-element-t3")).toBe("Маса 2 (10)");
    expect(screen.getByTestId("floor-plan-element-t1")).toHaveAttribute("fill", "#8B6CC9");
  });

  describe("logo watermark (Project C)", () => {
    it("renders the venue's logo as a watermark once fetched", async () => {
      profileLib.getVenueLogoUrl.mockResolvedValue("https://cdn.example/logo.png");
      renderPage();
      expect(await screen.findByTestId("floor-plan-watermark")).toHaveAttribute("href", "https://cdn.example/logo.png");
    });

    it("renders no watermark when the venue has no logo", async () => {
      renderPage();
      await waitFor(() => expect(profileLib.getVenueLogoUrl).toHaveBeenCalledWith("v1"));
      expect(screen.queryByTestId("floor-plan-watermark")).not.toBeInTheDocument();
    });
  });

  describe("zoom-to-fit (Project C — the one canvas this had been missed on)", () => {
    // jsdom always reports clientWidth 0, so the initial fit-to-width itself
    // (fitZoom's own arithmetic) is covered separately in
    // tests/lib/pure/seating-zoom-to-fit.test.ts — this just confirms the
    // manual zoom controls are wired to the canvas's scale transform at all,
    // the same pattern ReservationsClient and the new-event wizard already use.
    function zoomScale(container: HTMLElement): string {
      return container.querySelector<HTMLElement>(".qb-canvas-zoom")!.style.transform;
    }

    it("zooms in, out and resets via the +/- and reset buttons", () => {
      const { container } = renderPage();
      expect(zoomScale(container)).toBe("scale(1)");

      fireEvent.click(screen.getByRole("button", { name: "Зголеми" }));
      expect(zoomScale(container)).toBe("scale(1.15)");

      fireEvent.click(screen.getByRole("button", { name: "Намали" }));
      fireEvent.click(screen.getByRole("button", { name: "Намали" }));
      expect(zoomScale(container)).toBe("scale(0.85)");

      fireEvent.click(screen.getByRole("button", { name: "Ресетирај зум" }));
      expect(zoomScale(container)).toBe("scale(1)");
    });

    it("never zooms past the min/max bounds", () => {
      const { container } = renderPage();
      for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole("button", { name: "Зголеми" }));
      expect(zoomScale(container)).toBe("scale(1.4)");
      for (let i = 0; i < 20; i++) fireEvent.click(screen.getByRole("button", { name: "Намали" }));
      expect(zoomScale(container)).toBe("scale(0.6)");
    });
  });

  describe("room switcher and print link", () => {
    it("lists every room and navigates on switch", () => {
      renderPage();
      const select = screen.getByRole("combobox", { name: "Префрли просторија" });
      expect(Array.from(select.querySelectorAll("option")).map((o) => o.textContent)).toEqual(["Голема сала", "Тераса"]);
      fireEvent.change(select, { target: { value: "r2" } });
      expect(router.push).toHaveBeenCalledWith("/venue/rooms/r2/floor-plan");
    });

    it("links to the room's own printable plan", () => {
      renderPage();
      expect(screen.getByRole("link", { name: /Печати план/ })).toHaveAttribute("href", "/venue/rooms/r1/print");
    });
  });

  describe("room rename and delete (now the page you land on directly, not a separate panel)", () => {
    it("renames the room and refreshes the page data", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Преименувај просторија" }));
      const input = screen.getByLabelText("Име на просторијата");
      fireEvent.change(input, { target: { value: "Нова сала" } });
      fireEvent.submit(screen.getByRole("button", { name: "Зачувај" }).closest("form")!);
      await waitFor(() => expect(roomsLib.updateRoomName).toHaveBeenCalledWith("r1", "Нова сала"));
      await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    });

    it("deletes the room and navigates back to the room list", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Избриши просторија" }));
      expect(await screen.findByText("Да се избрише просторијата?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Да, избриши" }));
      await waitFor(() => expect(roomsLib.deleteRoom).toHaveBeenCalledWith("r1"));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/venue/tables"));
    });

    it("says what a room in use takes with it before it is deleted", async () => {
      roomsLib.roomUsage.mockResolvedValue({ events: 2, reservations: 1 });
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Избриши просторија" }));
      expect(await screen.findByText(/има 2 настани и 1 идна резервација/)).toBeInTheDocument();
      expect(roomsLib.deleteRoom).not.toHaveBeenCalled();
    });
  });

  describe("table type rename and delete (from the tile's own menu, not a separate list)", () => {
    it("opens a menu on the tile with options to use, rename or delete it", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Округла 10 \(/ }));
      expect(screen.getByRole("menuitem", { name: "Користи во распоредот" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Преименувај" })).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Избриши" })).toBeInTheDocument();
    });

    it("closes the tile menu when clicking outside it without choosing anything", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Округла 10 \(/ }));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("renames a table type via the tile menu", async () => {
      roomsLib.updateTableType.mockResolvedValue({ ...round, name: "Округла 12" });
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Округла 10 \(/ }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Преименувај" }));
      const nameField = screen.getByLabelText(/Име на видот маса/);
      fireEvent.change(nameField, { target: { value: "Округла 12" } });
      fireEvent.submit(screen.getByRole("button", { name: "Зачувај промени" }).closest("form")!);
      await waitFor(() => expect(roomsLib.updateTableType).toHaveBeenCalledWith("tt1", expect.objectContaining({ name: "Округла 12" })));
    });

    it("deletes a table type with no seated guests affected", async () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Округла 10 \(/ }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Избриши" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Да, избриши" }));
      await waitFor(() => expect(roomsLib.deleteTableType).toHaveBeenCalledWith("tt1"));
    });

    it("confirms with the manager before deleting a table type whose tables have seated guests", async () => {
      roomsLib.seatsAffectedByTableType.mockResolvedValue(3);
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /Округла 10 \(/ }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Избриши" }));
      fireEvent.click(screen.getByRole("menuitem", { name: "Да, избриши" }));
      await waitFor(() => expect(window.confirm).toHaveBeenCalled());
      expect(roomsLib.deleteTableType).toHaveBeenCalledWith("tt1");
    });
  });
});
