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

vi.mock("@/lib/venue/floorplan", async (importOriginal) => ({ ...(await importOriginal<object>()), ...lib }));
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
  lib.listFixedElements.mockResolvedValue([]);
  lib.listRoomLayoutElements.mockResolvedValue([]);
  lib.addFixedElement.mockResolvedValue({ id: "f1" });
  lib.addRoomLayoutElement.mockResolvedValue({ id: "n1" });
  lib.verifyLayoutLockPassword.mockResolvedValue(true);
});

function renderPage(layout: RoomLayoutElement[] = []) {
  render(
    <RoomFloorPlanPage venueId="v1" room={room} initialFixedElements={[]} initialLayoutElements={layout} initialTableTypes={[round, rect]} />,
  );
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
    const code = screen.getByLabelText(/Отклучи фиксен распоред/);
    fireEvent.change(code, { target: { value: "1234" } });
    fireEvent.submit(code.closest("form")!);
    fireEvent.click(await screen.findByRole("button", { name: "+ Влез" }));
    await waitFor(() => expect(lib.addFixedElement).toHaveBeenLastCalledWith(expect.objectContaining({ element_type: "entrance" })));
    fireEvent.click(screen.getByRole("button", { name: "+ WC" }));
    await waitFor(() => expect(lib.addFixedElement).toHaveBeenLastCalledWith(expect.objectContaining({ element_type: "wc" })));
  });

  it("numbers guest tables only and names the couple's table", () => {
    renderPage([el("t1", { table_role: "couple", table_type_id: "tt2" }), el("t2", {}), el("t3", {})]);
    expect(screen.getByText("Маса на младенците")).toBeInTheDocument();
    expect(screen.getByText("1 (10)")).toBeInTheDocument();
    expect(screen.getByText("2 (10)")).toBeInTheDocument();
    expect(screen.getByTestId("floor-plan-element-t1")).toHaveAttribute("fill", "#8B6CC9");
  });
});
