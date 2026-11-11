import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const presetsLib = vi.hoisted(() => ({
  listRoomPresets: vi.fn(),
  getRoomPresetSnapshot: vi.fn(),
  saveRoomPresetFromElements: vi.fn(),
}));
const floorplanLib = vi.hoisted(() => ({ listFixedElements: vi.fn() }));
const roomsLib = vi.hoisted(() => ({ listTableTypes: vi.fn() }));

vi.mock("@/lib/venue/room-presets", () => presetsLib);
vi.mock("@/lib/venue/floorplan", async (importOriginal) => ({ ...(await importOriginal<object>()), ...floorplanLib }));
vi.mock("@/lib/venue/rooms", async (importOriginal) => ({ ...(await importOriginal<object>()), ...roomsLib }));

import { EventRoomLayoutModal } from "@/components/venue/events/EventRoomLayoutModal";

beforeEach(() => {
  vi.clearAllMocks();
  presetsLib.listRoomPresets.mockResolvedValue([]);
  floorplanLib.listFixedElements.mockResolvedValue([]);
  roomsLib.listTableTypes.mockResolvedValue([]);
});

function renderModal(overrides: Partial<React.ComponentProps<typeof EventRoomLayoutModal>> = {}) {
  const onResolved = vi.fn();
  const onClose = vi.fn();
  render(
    <EventRoomLayoutModal roomId="r1" roomName="Градина" widthCm={1000} heightCm={800} onResolved={onResolved} onClose={onClose} {...overrides} />,
  );
  return { onResolved, onClose };
}

describe("EventRoomLayoutModal", () => {
  it("shows a load error when the room's data cannot be fetched", async () => {
    presetsLib.listRoomPresets.mockRejectedValue(new Error("boom"));
    renderModal();
    expect(await screen.findByRole("alert")).toHaveTextContent("Податоците не можеа да се вчитаат.");
  });

  it("opens straight on the first saved layout and only resolves once confirmed", async () => {
    presetsLib.listRoomPresets.mockResolvedValue([{ id: "p1", room_id: "r1", name: "Стандарден", created_at: "x", updated_at: "x" }]);
    const elements = [{ element_type: "table" as const, table_type_id: null, x_cm: 1, y_cm: 1, width_cm: 160, length_cm: 160, rotation_deg: 0, label: null, group_id: null, table_role: "guest" as const }];
    presetsLib.getRoomPresetSnapshot.mockResolvedValue({ fixed: [], elements });
    const { onResolved } = renderModal();

    expect(await screen.findByText("Стандарден", { selector: ".rl-name" })).toBeInTheDocument();
    await waitFor(() => expect(presetsLib.getRoomPresetSnapshot).toHaveBeenCalledWith("p1", "r1"));
    // Previewed, not yet resolved — the manager must confirm what they see.
    const confirm = screen.getByRole("button", { name: "Користи го овој распоред" });
    await waitFor(() => expect(confirm).toBeEnabled());
    expect(onResolved).not.toHaveBeenCalled();

    await userEvent.click(confirm);
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(elements));
  });

  it("flips between saved layouts with the arrows, loading each one once", async () => {
    presetsLib.listRoomPresets.mockResolvedValue([
      { id: "p1", room_id: "r1", name: "Стандарден", created_at: "x", updated_at: "x" },
      { id: "p2", room_id: "r1", name: "Банкет", created_at: "x", updated_at: "x" },
    ]);
    const banket = [{ element_type: "table" as const, table_type_id: null, x_cm: 5, y_cm: 5, width_cm: 160, length_cm: 160, rotation_deg: 0, label: null, group_id: null, table_role: "guest" as const }];
    presetsLib.getRoomPresetSnapshot.mockImplementation(async (id: string) => ({ fixed: [], elements: id === "p2" ? banket : [] }));
    const { onResolved } = renderModal();

    expect(await screen.findByText("Стандарден", { selector: ".rl-name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Претходен распоред" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Следен распоред" }));
    expect(await screen.findByText("Банкет", { selector: ".rl-name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Следен распоред" })).toBeDisabled();
    await waitFor(() => expect(presetsLib.getRoomPresetSnapshot).toHaveBeenCalledWith("p2", "r1"));

    await userEvent.click(screen.getByRole("button", { name: "Претходен распоред" }));
    await userEvent.click(screen.getByRole("button", { name: "Распоред 2" }));
    expect(presetsLib.getRoomPresetSnapshot).toHaveBeenCalledTimes(2);

    await waitFor(() => expect(screen.getByRole("button", { name: "Користи го овој распоред" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Користи го овој распоред" }));
    expect(onResolved).toHaveBeenCalledWith(banket);
  });

  it("re-opening a room starts on its current layout, ahead of the saved ones", async () => {
    presetsLib.listRoomPresets.mockResolvedValue([{ id: "p1", room_id: "r1", name: "Стандарден", created_at: "x", updated_at: "x" }]);
    const current = [{ element_type: "stage" as const, table_type_id: null, x_cm: 0, y_cm: 0, width_cm: 300, length_cm: 200, rotation_deg: 0, label: null, group_id: null, table_role: null }];
    const { onResolved } = renderModal({ initialElements: current as never });

    expect(await screen.findByText("Тековен распоред", { selector: ".rl-name" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Користи го овој распоред" }));
    expect(onResolved).toHaveBeenCalledWith(current);
    expect(presetsLib.getRoomPresetSnapshot).not.toHaveBeenCalled();
  });

  it("can start a new layout from the preview and go back to it", async () => {
    presetsLib.listRoomPresets.mockResolvedValue([{ id: "p1", room_id: "r1", name: "Стандарден", created_at: "x", updated_at: "x" }]);
    presetsLib.getRoomPresetSnapshot.mockResolvedValue({ fixed: [], elements: [] });
    const { onResolved } = renderModal();

    await userEvent.click(await screen.findByRole("button", { name: /нов распоред/i }));
    expect(screen.getByText("Нов распоред", { selector: ".rl-name" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(await screen.findByText("Стандарден", { selector: ".rl-name" })).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("goes straight to building a new layout when the room has no saved presets yet", async () => {
    renderModal();
    expect(await screen.findByText("Нема зачувани распореди за оваа сала сè уште.")).toBeInTheDocument();
    expect(screen.getByText("Нов распоред", { selector: ".rl-name" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Назад" })).not.toBeInTheDocument();
  });

  it("surfaces a preset-load error without resolving", async () => {
    presetsLib.listRoomPresets.mockResolvedValue([{ id: "p1", room_id: "r1", name: "Стандарден", created_at: "x", updated_at: "x" }]);
    presetsLib.getRoomPresetSnapshot.mockRejectedValue(new Error("boom"));
    const { onResolved } = renderModal();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Користи го овој распоред" })).toBeDisabled();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("building a brand-new layout and skipping the save resolves with the built (empty) elements", async () => {
    const { onResolved } = renderModal();

    await userEvent.click(await screen.findByRole("button", { name: "Готово" }));
    expect(await screen.findByText(/Да го зачувате овој распоред/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /продолжи без зачувување/i }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith([]));
    expect(presetsLib.saveRoomPresetFromElements).not.toHaveBeenCalled();
  });

  it("building a new layout and saving it calls saveRoomPresetFromElements before resolving", async () => {
    presetsLib.saveRoomPresetFromElements.mockResolvedValue({ id: "new-preset", room_id: "r1", name: "Мој план", created_at: "x", updated_at: "x" });
    const { onResolved } = renderModal();

    await userEvent.click(await screen.findByRole("button", { name: "Готово" }));
    await userEvent.type(screen.getByLabelText("Име на планот"), "Мој план");
    await userEvent.click(screen.getByRole("button", { name: /зачувај и продолжи/i }));

    await waitFor(() => expect(presetsLib.saveRoomPresetFromElements).toHaveBeenCalledWith("r1", "Мој план", []));
    expect(onResolved).toHaveBeenCalledWith([]);
  });

  it("refuses to save without a name, without resolving", async () => {
    const { onResolved } = renderModal();
    await userEvent.click(await screen.findByRole("button", { name: "Готово" }));
    await userEvent.click(screen.getByRole("button", { name: /зачувај и продолжи/i }));
    expect(await screen.findByText("Внесете име за планот.")).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
    expect(presetsLib.saveRoomPresetFromElements).not.toHaveBeenCalled();
  });

  it("calls onClose when dismissed", async () => {
    const { onClose } = renderModal();
    await userEvent.click(await screen.findByRole("button", { name: "Затвори" }));
    expect(onClose).toHaveBeenCalled();
  });
});
