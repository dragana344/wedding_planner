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

vi.mock("@/lib/venue/floorplan", async (importOriginal) => ({ ...(await importOriginal<object>()), ...lib }));
vi.mock("@/lib/venue/room-presets", () => presetsLib);
vi.mock("@/lib/venue/room-layout-history", () => historyLib);
vi.mock("@/lib/venue/venue-profile", () => profileLib);
vi.mock("@/components/venue/shell/ManagerElevationContext", () => ({
  useManagerElevation: () => ({ managerName: elevation.managerName, isOwner: false, token: elevation.managerName ? "test-token" : null }),
}));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { RoomFloorPlanPage } from "@/components/venue/dashboard/RoomFloorPlanPage";

const room = { id: "r1", venue_id: "v1", name: "Голема сала", width_cm: 2000, height_cm: 1500 } as Room;
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
  presetsLib.listRoomPresets.mockResolvedValue([]);
  profileLib.getVenueLogoUrl.mockResolvedValue(null);
  historyLib.recordAroundRoom.mockImplementation((_roomId: string, edit: () => Promise<unknown>) => edit());
  historyLib.roomHistoryStepState.mockResolvedValue({ canUndo: false, canRedo: false });
  vi.stubGlobal("confirm", vi.fn(() => true));
});

function renderPage(layout: RoomLayoutElement[] = []) {
  render(
    <RoomFloorPlanPage venueId="v1" room={room} initialFixedElements={[]} initialLayoutElements={layout} initialTableTypes={[round, rect]} />,
  );
}

async function unlock() {
  const code = screen.getByLabelText(/Отклучи фиксен распоред/);
  fireEvent.change(code, { target: { value: "1234" } });
  fireEvent.submit(code.closest("form")!);
  await screen.findByRole("button", { name: "+ Влез" });
}

describe("RoomFloorPlanPage palette (B4)", () => {
  it("adds couple and head tables, music and a photo stage", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "+ Маса на младенците" }));
    await waitFor(() =>
      expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(
        expect.objectContaining({ element_type: "table", table_role: "couple", table_type_id: "tt2" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "+ Главна маса" }));
    await waitFor(() => expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(expect.objectContaining({ table_role: "head" })));
    fireEvent.click(screen.getByRole("button", { name: "+ Музика" }));
    await waitFor(() => expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(expect.objectContaining({ element_type: "music" })));
    fireEvent.click(screen.getByRole("button", { name: "+ Бина за сликање" }));
    await waitFor(() => expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(expect.objectContaining({ element_type: "photo_stage" })));
    fireEvent.click(screen.getByRole("button", { name: /\+ Округла 10/ }));
    await waitFor(() => expect(lib.addRoomLayoutElement).toHaveBeenLastCalledWith(expect.objectContaining({ table_type_id: "tt1", label: null })));
  });

  it("adds an entrance and a WC once the layout is unlocked", async () => {
    renderPage();
    expect(screen.queryByRole("button", { name: "+ Влез" })).not.toBeInTheDocument();
    await unlock();
    fireEvent.click(await screen.findByRole("button", { name: "+ Влез" }));
    await waitFor(() => expect(lib.addFixedElement).toHaveBeenLastCalledWith(expect.objectContaining({ element_type: "entrance" })));
    fireEvent.click(screen.getByRole("button", { name: "+ WC" }));
    await waitFor(() => expect(lib.addFixedElement).toHaveBeenLastCalledWith(expect.objectContaining({ element_type: "wc" })));
  });

  describe("manager-only fixed layout unlock", () => {
    it("hides the unlock control entirely for a plain staff session", () => {
      elevation.managerName = null;
      renderPage();
      expect(screen.queryByLabelText(/Отклучи фиксен распоред/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "+ Влез" })).not.toBeInTheDocument();
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
      fireEvent.click(screen.getByRole("button", { name: "+ Музика" }));
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
    // The label is long enough to wrap onto two lines inside the table (one
    // <tspan> per line) rather than overflowing it, so it's no longer one
    // plain text node — rejoin the lines before comparing.
    const coupleLabelText = screen.getByTestId("floor-plan-element-t1").closest("g")!.querySelector("text")!;
    const tspans = coupleLabelText.querySelectorAll("tspan");
    const coupleLabel = tspans.length > 0 ? Array.from(tspans).map((t) => t.textContent).join(" ") : coupleLabelText.textContent;
    expect(coupleLabel).toBe("Маса на младенците");
    expect(screen.getByText("1 (10)")).toBeInTheDocument();
    expect(screen.getByText("2 (10)")).toBeInTheDocument();
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
});
