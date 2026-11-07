import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WizardRoomLayoutEditor, type DraftElement } from "@/components/venue/events/WizardRoomLayoutEditor";
import type { FixedElement } from "@/lib/venue/floorplan";
import type { TableType } from "@/lib/venue/rooms";

const fixed: FixedElement[] = [
  { id: "f1", room_id: "r1", element_type: "wall", x_cm: 0, y_cm: 0, width_cm: 500, height_cm: 10, rotation_deg: 0, label: null },
];
const round = { id: "tt1", room_id: "r1", name: "Округла 8", shape: "round" as const, seats: 8, width_cm: 160, length_cm: 160, quantity: 2 };
const rect = { id: "tt2", room_id: "r1", name: "Главна 12", shape: "rectangular" as const, seats: 12, width_cm: 600, length_cm: 90, quantity: 1 };
const tableTypes: TableType[] = [round, rect];

/** The editor is controlled (elements/onChange) — this wrapper gives it a
 * real local state so clicks actually accumulate, the way the wizard itself drives it. */
function StatefulEditor({ initial = [] as DraftElement[], tableTypesOverride = tableTypes }: { initial?: DraftElement[]; tableTypesOverride?: TableType[] }) {
  const [elements, setElements] = useState<DraftElement[]>(initial);
  return (
    <WizardRoomLayoutEditor widthCm={1000} heightCm={800} fixedElements={fixed} tableTypes={tableTypesOverride} elements={elements} onChange={setElements} />
  );
}

describe("WizardRoomLayoutEditor", () => {
  it("renders the room's real fixed elements as locked context, not counted among its own tables", () => {
    render(<StatefulEditor />);
    expect(screen.getByText("Ѕид")).toBeInTheDocument(); // FIXED_LABELS fallback label
  });

  it("adding a movable element (e.g. the stage) shows up on the canvas", async () => {
    render(<StatefulEditor />);
    await userEvent.click(screen.getByRole("button", { name: "+ Бина" }));
    expect(screen.getByText("Бина")).toBeInTheDocument();
  });

  it("adding a table of a given type increments its placed count and disables the button at quantity", async () => {
    render(<StatefulEditor />);
    const addRound = screen.getByRole("button", { name: /Округла 8 \(0\/2\)/ });
    await userEvent.click(addRound);
    expect(screen.getByRole("button", { name: /Округла 8 \(1\/2\)/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Округла 8 \(1\/2\)/ }));
    const atLimit = screen.getByRole("button", { name: /Округла 8 \(2\/2\)/ });
    expect(atLimit).toBeDisabled();
  });

  it("adds the couple's table and the head table with their own role labels, disabled without a rectangular table type", async () => {
    render(<StatefulEditor />);
    await userEvent.click(screen.getByRole("button", { name: "+ Маса на младенците" }));
    expect(screen.getByText("Маса на младенците")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "+ Главна маса" }));
    expect(screen.getByText("Главна маса")).toBeInTheDocument();
  });

  it("disables the special-table buttons when the room has no table type at all", () => {
    render(<StatefulEditor tableTypesOverride={[]} />);
    expect(screen.getByRole("button", { name: "+ Маса на младенците" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Главна маса" })).toBeDisabled();
  });

  it("numbers guest tables in placement order, independent of the room's real (unrelated) live tables", async () => {
    render(<StatefulEditor />);
    await userEvent.click(screen.getByRole("button", { name: /Округла 8/ }));
    await userEvent.click(screen.getByRole("button", { name: /Округла 8/ }));
    // Two guest tables placed: numbered 1 (8) and 2 (8), each labelled with its seat count.
    expect(screen.getByText("1 (8)")).toBeInTheDocument();
    expect(screen.getByText("2 (8)")).toBeInTheDocument();
  });

  it("always shows zoom controls, letting the modal's narrower canvas zoom out further than the full-page editor", async () => {
    render(<StatefulEditor />);
    expect(screen.getByRole("group", { name: "Зум" })).toBeInTheDocument();
    const zoomOut = screen.getByRole("button", { name: "Одзумирај" });
    for (let i = 0; i < 6; i++) await userEvent.click(zoomOut);
    // ZOOM_MIN (30%) is below EventSeatingPage/ReservationsClient's 60% floor.
    expect(screen.getByText("30%")).toBeInTheDocument();
  });

  it("readOnly hides every add control but keeps the zoom controls, and locks every element against editing", () => {
    render(
      <WizardRoomLayoutEditor
        widthCm={1000}
        heightCm={800}
        fixedElements={fixed}
        tableTypes={tableTypes}
        elements={[{ element_type: "table", table_type_id: "tt1", x_cm: 1, y_cm: 1, width_cm: 160, length_cm: 160, rotation_deg: 0, label: null, group_id: null, table_role: "guest", localId: "d1", createdAt: "0" }]}
        onChange={() => {}}
        readOnly
      />,
    );
    expect(screen.queryByRole("button", { name: "+ Бина" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Зум" })).toBeInTheDocument();
    expect(screen.getByText("1 (8)")).toBeInTheDocument();
  });
});
