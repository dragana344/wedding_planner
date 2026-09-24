import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FloorPlanCanvas, type CanvasElement } from "@/components/venue/dashboard/FloorPlanCanvas";

const table: CanvasElement = {
  id: "t1",
  x_cm: 100,
  y_cm: 100,
  width_cm: 150,
  height_cm: 150,
  color: "#3B82F6",
  label: "Table 1",
  shape: "circle",
};

const lockedWall: CanvasElement = {
  id: "w1",
  x_cm: 0,
  y_cm: 0,
  width_cm: 100,
  height_cm: 20,
  color: "#525252",
  label: "wall",
  shape: "rect",
  locked: true,
};

function renderCanvas(overrides: Partial<Parameters<typeof FloorPlanCanvas>[0]> = {}) {
  const onSelect = vi.fn();
  const onMoveEnd = vi.fn();
  const onResizeEnd = vi.fn();
  const onRotateEnd = vi.fn();
  const onDelete = vi.fn();
  render(
    <FloorPlanCanvas
      widthCm={2000}
      heightCm={1500}
      elements={[table]}
      selectedElementId={null}
      onSelect={onSelect}
      onMoveEnd={onMoveEnd}
      onResizeEnd={onResizeEnd}
      onRotateEnd={onRotateEnd}
      onDelete={onDelete}
      {...overrides}
    />
  );
  return { onSelect, onMoveEnd, onResizeEnd, onRotateEnd, onDelete };
}

describe("FloorPlanCanvas", () => {
  it("renders each element with its label", () => {
    renderCanvas();
    expect(screen.getByText("Table 1")).toBeInTheDocument();
  });

  it("selects an element on pointer down, and deselects on empty canvas pointer down", () => {
    const { onSelect } = renderCanvas();
    fireEvent.pointerDown(screen.getByTestId("floor-plan-element-t1"));
    expect(onSelect).toHaveBeenCalledWith("t1");

    fireEvent.pointerDown(screen.getByTestId("floor-plan-canvas"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("shows the resize handle and delete badge only for a selected, unlocked element", () => {
    renderCanvas({ selectedElementId: "t1" });
    expect(screen.getByTestId("floor-plan-resize-t1")).toBeInTheDocument();
    expect(screen.getByTestId("floor-plan-delete-t1")).toBeInTheDocument();
  });

  it("never shows a resize handle or delete badge for a locked element, even when selected", () => {
    renderCanvas({ elements: [lockedWall], selectedElementId: "w1" });
    expect(screen.queryByTestId("floor-plan-resize-w1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("floor-plan-delete-w1")).not.toBeInTheDocument();
  });

  it("never shows a rotate handle for a locked element, even when selected", () => {
    renderCanvas({ elements: [lockedWall], selectedElementId: "w1" });
    expect(screen.queryByTestId("floor-plan-rotate-w1")).not.toBeInTheDocument();
  });

  it("shows the rotate handle for a selected, unlocked element", () => {
    renderCanvas({ selectedElementId: "t1" });
    expect(screen.getByTestId("floor-plan-rotate-t1")).toBeInTheDocument();
  });

  it("dragging an element persists its final position on pointer up, translated to real-world cm", () => {
    const { onMoveEnd } = renderCanvas();
    const el = screen.getByTestId("floor-plan-element-t1");
    fireEvent.pointerDown(el, { clientX: 300, clientY: 300 });
    // Move 40px right, 40px down = 100cm right, 100cm down at PX_PER_CM=0.4.
    fireEvent.pointerMove(window, { clientX: 340, clientY: 340 });
    fireEvent.pointerUp(window);
    expect(onMoveEnd).toHaveBeenCalledWith("t1", 200, 200);
  });

  it("clamps a drag so the element cannot be moved outside the room bounds", () => {
    const { onMoveEnd } = renderCanvas();
    const el = screen.getByTestId("floor-plan-element-t1");
    fireEvent.pointerDown(el, { clientX: 300, clientY: 300 });
    // Attempt to move far past the room's right/bottom edge.
    fireEvent.pointerMove(window, { clientX: 5000, clientY: 5000 });
    fireEvent.pointerUp(window);
    // Room is 2000x1500cm, element is 150x150cm, so max x/y is 1850/1350.
    expect(onMoveEnd).toHaveBeenCalledWith("t1", 1850, 1350);
  });

  it("a locked element does not start a drag", () => {
    const { onMoveEnd } = renderCanvas({ elements: [lockedWall], selectedElementId: "w1" });
    const el = screen.getByTestId("floor-plan-element-w1");
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 200, clientY: 200 });
    fireEvent.pointerUp(window);
    expect(onMoveEnd).not.toHaveBeenCalled();
  });

  it("resizing via the handle persists the final size on pointer up", () => {
    const { onResizeEnd } = renderCanvas({ selectedElementId: "t1" });
    const handle = screen.getByTestId("floor-plan-resize-t1");
    fireEvent.pointerDown(handle, { clientX: 300, clientY: 300 });
    // Grow 20px right, 20px down = 50cm each dimension at PX_PER_CM=0.4.
    fireEvent.pointerMove(window, { clientX: 320, clientY: 320 });
    fireEvent.pointerUp(window);
    expect(onResizeEnd).toHaveBeenCalledWith("t1", 200, 200);
  });

  it("clicking the delete badge calls onDelete and does not also trigger a move", () => {
    const { onDelete, onMoveEnd } = renderCanvas({ selectedElementId: "t1" });
    fireEvent.pointerDown(screen.getByTestId("floor-plan-delete-t1"));
    expect(onDelete).toHaveBeenCalledWith("t1");
    expect(onMoveEnd).not.toHaveBeenCalled();
  });

  it("calls onMoveEnd exactly once per completed drag, even across a re-render mid-drag", () => {
    const onMoveEnd = vi.fn();
    const { rerender } = render(
      <FloorPlanCanvas
        widthCm={2000}
        heightCm={1500}
        elements={[table]}
        selectedElementId={null}
        onSelect={vi.fn()}
        onMoveEnd={onMoveEnd}
        onResizeEnd={vi.fn()}
        onRotateEnd={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const el = screen.getByTestId("floor-plan-element-t1");
    fireEvent.pointerDown(el, { clientX: 300, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 320, clientY: 320 });
    // Simulate a parent re-render occurring mid-drag (e.g. an unrelated state change).
    rerender(
      <FloorPlanCanvas
        widthCm={2000}
        heightCm={1500}
        elements={[table]}
        selectedElementId="t1"
        onSelect={vi.fn()}
        onMoveEnd={onMoveEnd}
        onResizeEnd={vi.fn()}
        onRotateEnd={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    fireEvent.pointerUp(window);
    expect(onMoveEnd).toHaveBeenCalledTimes(1);
  });

  it("marks two overlapping elements with a warning stroke, and non-overlapping elements are unmarked", () => {
    const overlapping: CanvasElement = {
      id: "t2",
      x_cm: 150,
      y_cm: 150,
      width_cm: 150,
      height_cm: 150,
      color: "#3B82F6",
      label: "Table 2",
      shape: "circle",
    };
    const farAway: CanvasElement = {
      id: "t3",
      x_cm: 1500,
      y_cm: 1200,
      width_cm: 100,
      height_cm: 100,
      color: "#3B82F6",
      label: "Table 3",
      shape: "circle",
    };
    renderCanvas({ elements: [table, overlapping, farAway] });
    expect(screen.getByTestId("floor-plan-element-t1")).toHaveAttribute("stroke", "#dc2626");
    expect(screen.getByTestId("floor-plan-element-t2")).toHaveAttribute("stroke", "#dc2626");
    expect(screen.getByTestId("floor-plan-element-t3")).toHaveAttribute("stroke", "none");
  });

  it("updates the overlap warning live while dragging one element into another", () => {
    const stationary: CanvasElement = {
      id: "t2",
      x_cm: 1000,
      y_cm: 1000,
      width_cm: 150,
      height_cm: 150,
      color: "#3B82F6",
      label: "Table 2",
      shape: "circle",
    };
    renderCanvas({ elements: [table, stationary] });
    expect(screen.getByTestId("floor-plan-element-t1")).toHaveAttribute("stroke", "none");

    const el = screen.getByTestId("floor-plan-element-t1");
    fireEvent.pointerDown(el, { clientX: 300, clientY: 300 });
    // Drag t1 (100,100 150x150) onto t2 (1000,1000 150x150): move by 900cm each axis = 360px at 0.4 px/cm.
    fireEvent.pointerMove(window, { clientX: 660, clientY: 660 });
    expect(screen.getByTestId("floor-plan-element-t1")).toHaveAttribute("stroke", "#dc2626");
    expect(screen.getByTestId("floor-plan-element-t2")).toHaveAttribute("stroke", "#dc2626");
    fireEvent.pointerUp(window);
  });

  it("rotating via the handle persists the final rotation on pointer up", () => {
    const { onRotateEnd } = renderCanvas({ selectedElementId: "t1" });
    const handle = screen.getByTestId("floor-plan-rotate-t1");
    // Element t1 is 100,100 150x150cm -> center at (175,175)cm -> (70,70)px. jsdom's
    // getBoundingClientRect is all-zero, so the canvas origin is page (0,0).
    // Start directly right of center (angle 0deg), end directly below center (angle 90deg).
    fireEvent.pointerDown(handle, { clientX: 120, clientY: 70 });
    fireEvent.pointerMove(window, { clientX: 70, clientY: 120 });
    fireEvent.pointerUp(window);
    expect(onRotateEnd).toHaveBeenCalledWith("t1", 90);
  });

  it("applies a rotation transform to an element's shape group", () => {
    const rotated: CanvasElement = { ...table, id: "t4", rotationDeg: 45 };
    renderCanvas({ elements: [rotated] });
    const group = screen.getByTestId("floor-plan-rotation-group-t4");
    expect(group.getAttribute("transform")).toContain("rotate(45");
  });
});

describe("FloorPlanCanvas select mode", () => {
  it("calls onToggleSelect on pointer down for an unlocked element, instead of starting a drag", () => {
    const onToggleSelect = vi.fn();
    const onMoveEnd = vi.fn();
    renderCanvas({ mode: "select", selectedIds: [], onToggleSelect, onMoveEnd });

    const el = screen.getByTestId("floor-plan-element-t1");
    fireEvent.pointerDown(el, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 150 });
    fireEvent.pointerUp(window);

    expect(onToggleSelect).toHaveBeenCalledWith("t1");
    expect(onMoveEnd).not.toHaveBeenCalled();
  });

  it("does not call onToggleSelect for a locked element in select mode", () => {
    const onToggleSelect = vi.fn();
    renderCanvas({ mode: "select", selectedIds: [], onToggleSelect, elements: [lockedWall] });

    fireEvent.pointerDown(screen.getByTestId("floor-plan-element-w1"));
    expect(onToggleSelect).not.toHaveBeenCalled();
  });

  it("highlights every id in selectedIds, and never renders resize/rotate/delete handles, in select mode", () => {
    renderCanvas({ mode: "select", selectedIds: ["t1"], onToggleSelect: vi.fn() });

    expect(screen.getByTestId("floor-plan-element-t1")).toHaveAttribute("stroke", "#171717");
    expect(screen.queryByTestId("floor-plan-resize-t1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("floor-plan-rotate-t1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("floor-plan-delete-t1")).not.toBeInTheDocument();
  });

  it("defaults to edit mode, leaving every existing caller's behavior unchanged", () => {
    const onMoveEnd = vi.fn();
    renderCanvas({ onMoveEnd });
    const el = screen.getByTestId("floor-plan-element-t1");
    fireEvent.pointerDown(el, { clientX: 300, clientY: 300 });
    fireEvent.pointerMove(window, { clientX: 340, clientY: 340 });
    fireEvent.pointerUp(window);
    expect(onMoveEnd).toHaveBeenCalledWith("t1", 200, 200);
  });
});
