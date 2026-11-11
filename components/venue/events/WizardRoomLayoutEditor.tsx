"use client";

import { useEffect, useRef, useState } from "react";
import { FloorPlanCanvas, PX_PER_CM, type CanvasElement } from "@/components/venue/dashboard/FloorPlanCanvas";
import { fitZoom } from "@/lib/seating/zoom-to-fit";
import {
  FIXED_TYPE_COLORS,
  MOVABLE_TYPE_COLORS,
  FIXED_LABELS,
  MOVABLE_LABELS,
  TABLE_ROLE_LABELS,
  COUPLE_TABLE_COLOR,
  numberTables,
  type TableRole,
  type FixedElement,
  type LayoutElementType,
  type RoomLayoutElement,
} from "@/lib/venue/floorplan";
import { type TableType } from "@/lib/venue/rooms";
import { openSpot } from "@/lib/venue/open-spot";
import type { SnapshotElement } from "@/lib/venue/room-presets";

/** One in-progress element, built only in this editor's own local state — no
 * server round-trip until the wizard submits the whole event. Needs a local
 * id (SnapshotElement itself has none) purely to drive FloorPlanCanvas's
 * move/resize/rotate/delete callbacks and React's list keys. */
type DraftElement = SnapshotElement & {
  localId: string;
  /** A monotonically increasing stand-in for created_at — numberTables
   * sorts by it to number guest tables in placement order; a real DB
   * created_at doesn't exist yet since nothing here is persisted. */
  createdAt: string;
};

// The wizard's modal is narrower than the room editor's full page, so a
// room that would already need zooming out there needs it sooner here —
// hence a lower floor than EventSeatingPage/ReservationsClient's 0.6.
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.15;
const ZOOM_BUTTON_CLASS =
  "rounded-full border border-neutral-200 px-3 py-1.5 text-[14.5px] font-medium text-neutral-700 hover:border-lilac-dark hover:text-lilac-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-neutral-700";

let nextSeq = 0;
/** One shared, monotonically increasing sequence number per new element —
 * used for both its local id and its stand-in created_at, so the two always
 * advance together. */
function nextLocalIdAndCreatedAt(): { localId: string; createdAt: string } {
  nextSeq += 1;
  return { localId: `draft-${nextSeq}`, createdAt: String(nextSeq).padStart(12, "0") };
}

/**
 * Builds a brand-new room layout from scratch, right inside the
 * event-creation wizard, before the event (or any DB row for this layout)
 * exists. Mirrors RoomFloorPlanPage's add/move/resize/rotate/delete
 * handlers, but every one of them only ever touches local React state —
 * the room's real fixed elements are shown for context (walls/doors aren't
 * editable here) and the room's real movable elements are never read, so
 * this never risks mutating the shared room template.
 */
export function WizardRoomLayoutEditor({
  widthCm,
  heightCm,
  fixedElements,
  tableTypes,
  elements,
  onChange,
  readOnly = false,
}: {
  widthCm: number;
  heightCm: number;
  /** The room's real walls/doors/pillars — read-only context, not part of this event's own layout. */
  fixedElements: FixedElement[];
  tableTypes: TableType[];
  elements: DraftElement[];
  onChange: (elements: DraftElement[]) => void;
  /** Previewing an already-built layout (e.g. a saved preset, before
   * confirming it): hides the add-controls and locks every element so the
   * canvas is just a visualization, not an editing session. */
  readOnly?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  // Starts zoomed to fit the modal's own (narrower) box, once — its width,
  // and its height when the modal gives the canvas a fixed height; the manual
  // +/- buttons below still work from there.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const style = getComputedStyle(el);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) || 0;
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) || 0;
    setZoom(
      Math.min(
        fitZoom(widthCm, PX_PER_CM, el.clientWidth - padX, ZOOM_MIN),
        fitZoom(heightCm, PX_PER_CM, el.clientHeight - padY, ZOOM_MIN),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tablesPlacedForType(tableTypeId: string): number {
    return elements.filter((el) => el.element_type === "table" && el.table_type_id === tableTypeId).length;
  }

  function add(partial: Omit<DraftElement, "localId" | "createdAt" | "rotation_deg" | "group_id">) {
    const { localId, createdAt } = nextLocalIdAndCreatedAt();
    onChange([...elements, { ...partial, rotation_deg: 0, group_id: null, localId, createdAt }]);
    setSelectedId(localId);
  }

  function existingForSpot() {
    return [...fixedElements, ...elements];
  }

  function handleAddMovable(type: LayoutElementType) {
    add({
      element_type: type,
      table_type_id: null,
      ...openSpot(
        { x_cm: Math.max(0, (widthCm - 200) / 2), y_cm: Math.max(0, (heightCm - 150) / 2) },
        { width_cm: 200, length_cm: 150 },
        { width_cm: widthCm, height_cm: heightCm },
        existingForSpot(),
      ),
      width_cm: 200,
      length_cm: 150,
      label: null,
      table_role: "guest",
    });
  }

  const specialTableType = tableTypes.find((tt) => tt.shape === "rectangular") ?? tableTypes[0] ?? null;

  function handleAddSpecialTable(role: Exclude<TableRole, "guest">) {
    if (!specialTableType) return;
    add({
      element_type: "table",
      table_type_id: specialTableType.id,
      table_role: role,
      ...openSpot(
        { x_cm: Math.max(0, (widthCm - specialTableType.width_cm) / 2), y_cm: 100 },
        { width_cm: specialTableType.width_cm, length_cm: specialTableType.length_cm },
        { width_cm: widthCm, height_cm: heightCm },
        existingForSpot(),
      ),
      width_cm: specialTableType.width_cm,
      length_cm: specialTableType.length_cm,
      label: null,
    });
  }

  function handleAddTable(tableType: TableType) {
    if (tablesPlacedForType(tableType.id) >= tableType.quantity) return;
    add({
      element_type: "table",
      table_type_id: tableType.id,
      ...openSpot(
        { x_cm: Math.max(0, (widthCm - tableType.width_cm) / 2), y_cm: Math.max(0, (heightCm - tableType.length_cm) / 2) },
        { width_cm: tableType.width_cm, length_cm: tableType.length_cm },
        { width_cm: widthCm, height_cm: heightCm },
        existingForSpot(),
      ),
      width_cm: tableType.width_cm,
      length_cm: tableType.length_cm,
      label: null,
      table_role: "guest",
    });
  }

  function update(localId: string, patch: Partial<DraftElement>) {
    onChange(elements.map((el) => (el.localId === localId ? { ...el, ...patch } : el)));
  }

  function handleMoveEnd(localId: string, xCm: number, yCm: number) {
    update(localId, { x_cm: xCm, y_cm: yCm });
  }

  function handleResizeEnd(localId: string, w: number, h: number) {
    update(localId, { width_cm: w, length_cm: h });
  }

  function handleRotateEnd(localId: string, rotationDeg: number) {
    update(localId, { rotation_deg: rotationDeg });
  }

  function handleDelete(localId: string) {
    onChange(elements.filter((el) => el.localId !== localId));
    setSelectedId(null);
  }

  const tableNumbers = numberTables(
    elements.map(
      (el) =>
        ({ ...el, id: el.localId, room_id: "", created_at: el.createdAt }) as unknown as RoomLayoutElement,
    ),
  );

  const canvasElements: CanvasElement[] = [
    ...fixedElements.map((el) => ({
      id: el.id,
      x_cm: el.x_cm,
      y_cm: el.y_cm,
      width_cm: el.width_cm,
      height_cm: el.height_cm,
      color: FIXED_TYPE_COLORS[el.element_type],
      label: el.label ?? FIXED_LABELS[el.element_type],
      shape: "rect" as const,
      locked: true,
      rotationDeg: el.rotation_deg,
    })),
    ...elements.map((el) => {
      const tableType = el.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : null;
      const shape: "rect" | "circle" = el.element_type === "table" ? (tableType?.shape === "rectangular" ? "rect" : "circle") : "rect";
      const tableNumber = tableNumbers.get(el.localId);
      const role = el.table_role ?? "guest";
      const label =
        el.element_type === "table" && role !== "guest"
          ? (el.label ?? TABLE_ROLE_LABELS[role])
          : el.element_type === "table" && tableNumber != null
          ? tableType
            ? `${tableNumber} (${tableType.seats})`
            : String(tableNumber)
          : (el.label ?? MOVABLE_LABELS[el.element_type as LayoutElementType]);
      return {
        id: el.localId,
        x_cm: el.x_cm,
        y_cm: el.y_cm,
        width_cm: el.width_cm,
        height_cm: el.length_cm,
        color: el.element_type === "table" && role === "couple" ? COUPLE_TABLE_COLOR : MOVABLE_TYPE_COLORS[el.element_type as LayoutElementType],
        label,
        shape,
        rotationDeg: el.rotation_deg,
        seatCount: el.element_type === "table" ? tableType?.seats : undefined,
        locked: readOnly || undefined,
      };
    }),
  ];

  return (
    <div className="rl-editor" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {readOnly ? null : (
        <div className="chip-row">
          <button type="button" className="chip" onClick={() => handleAddMovable("stage")}>
            + Бина
          </button>
          <button type="button" className="chip" onClick={() => handleAddMovable("dance_floor")}>
            + Танц подиум
          </button>
          <button type="button" className="chip" onClick={() => handleAddMovable("bar_movable")}>
            + Шанк
          </button>
          <button type="button" className="chip" onClick={() => handleAddMovable("music")}>
            + Музика
          </button>
          <button type="button" className="chip" onClick={() => handleAddMovable("photo_stage")}>
            + Бина за сликање
          </button>
          <button type="button" className="chip" disabled={!specialTableType} onClick={() => handleAddSpecialTable("couple")}>
            + Маса на младенците
          </button>
          <button type="button" className="chip" disabled={!specialTableType} onClick={() => handleAddSpecialTable("head")}>
            + Главна маса
          </button>
          {tableTypes.map((tt) => (
            <button
              key={tt.id}
              type="button"
              className="chip"
              onClick={() => handleAddTable(tt)}
              disabled={tablesPlacedForType(tt.id) >= tt.quantity}
            >
              + {tt.name} ({tablesPlacedForType(tt.id)}/{tt.quantity})
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1" role="group" aria-label="Зум">
        <button type="button" aria-label="Одзумирај" className={ZOOM_BUTTON_CLASS} onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}>
          −
        </button>
        <button type="button" className={ZOOM_BUTTON_CLASS} onClick={() => setZoom(1)}>
          100%
        </button>
        <button type="button" aria-label="Зумирај" className={ZOOM_BUTTON_CLASS} onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}>
          +
        </button>
        <span className="ml-1 text-[12.5px] text-neutral-500">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="qb-canvas-wrap" ref={canvasWrapRef}>
        <FloorPlanCanvas
          widthCm={widthCm}
          heightCm={heightCm}
          elements={canvasElements}
          selectedElementId={selectedId}
          onSelect={setSelectedId}
          onMoveEnd={handleMoveEnd}
          onResizeEnd={handleResizeEnd}
          onRotateEnd={handleRotateEnd}
          onDelete={handleDelete}
          zoom={zoom}
        />
      </div>
    </div>
  );
}

export type { DraftElement };
