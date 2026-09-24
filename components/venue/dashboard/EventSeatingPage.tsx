"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FloorPlanCanvas, type CanvasElement } from "./FloorPlanCanvas";
import {
  listFixedElements,
  listEventLayoutElements,
  initializeEventLayoutFromStandard,
  addEventLayoutElement,
  updateEventLayoutElementPosition,
  updateEventLayoutElementSize,
  updateEventLayoutElementRotation,
  deleteEventLayoutElement,
  revertEventLayoutToStandard,
  captureEventLayoutSnapshot,
  undoEventLayout,
  FIXED_TYPE_COLORS,
  MOVABLE_TYPE_COLORS,
  type FixedElement,
  type EventLayoutElement,
  type EventLayoutElementInput,
  type LayoutElementType,
} from "@/lib/venue/floorplan";
import { type Room, type TableType } from "@/lib/venue/rooms";

const PALETTE_BUTTON_CLASS =
  "rounded-full border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:border-lilac-dark hover:text-lilac-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:text-neutral-700";

export interface SeatingActions {
  listFixedElements: (roomId: string) => Promise<FixedElement[]>;
  listLayoutElements: (eventId: string, roomId: string) => Promise<EventLayoutElement[]>;
  initializeFromStandard: (eventId: string, roomId: string) => Promise<EventLayoutElement[]>;
  addElement: (input: EventLayoutElementInput) => Promise<EventLayoutElement>;
  moveElement: (id: string, xCm: number, yCm: number) => Promise<EventLayoutElement>;
  resizeElement: (id: string, widthCm: number, lengthCm: number) => Promise<EventLayoutElement>;
  rotateElement: (id: string, rotationDeg: number) => Promise<EventLayoutElement>;
  deleteElement: (id: string) => Promise<void>;
  revertToStandard: (eventId: string, roomId: string) => Promise<EventLayoutElement[]>;
  captureSnapshot: (eventId: string, roomId: string) => Promise<void>;
  undo: (eventId: string, roomId: string) => Promise<EventLayoutElement[]>;
  /** Organizer-only: when present, this editor is working on a private draft
   * rather than the shared live layout, and the confirm toggle renders.
   * Absent for staff, whose edits stay live and unaffected either way. */
  getConfirmedAt?: (eventId: string, roomId: string) => Promise<string | null>;
  confirm?: (eventId: string, roomId: string) => Promise<void>;
  unconfirm?: (eventId: string, roomId: string) => Promise<void>;
}

export const venueSeatingActions: SeatingActions = {
  listFixedElements,
  listLayoutElements: listEventLayoutElements,
  initializeFromStandard: initializeEventLayoutFromStandard,
  addElement: addEventLayoutElement,
  moveElement: updateEventLayoutElementPosition,
  resizeElement: updateEventLayoutElementSize,
  rotateElement: updateEventLayoutElementRotation,
  deleteElement: deleteEventLayoutElement,
  revertToStandard: revertEventLayoutToStandard,
  captureSnapshot: captureEventLayoutSnapshot,
  undo: undoEventLayout,
};

export function EventSeatingPage({
  eventId,
  eventName,
  room,
  initialFixedElements,
  initialLayoutElements,
  initialTableTypes,
  actions = venueSeatingActions,
  skipInitialization = false,
  backHref = "/venue/events",
  backLabel = "← Back to events",
  onBack,
}: {
  eventId: string;
  eventName: string;
  room: Room;
  initialFixedElements: FixedElement[];
  initialLayoutElements: EventLayoutElement[];
  initialTableTypes: TableType[];
  actions?: SeatingActions;
  skipInitialization?: boolean;
  backHref?: string;
  backLabel?: string;
  /** When rendered inside an overlay rather than a routed page, closing it is
   * an in-place state change, not a navigation — pass this instead of relying
   * on backHref/backLabel, which render a real <Link> otherwise. */
  onBack?: () => void;
}) {
  const [fixedElements] = useState(initialFixedElements);
  const [layoutElements, setLayoutElements] = useState(initialLayoutElements);
  const [tableTypes] = useState(initialTableTypes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [isTogglingConfirm, setIsTogglingConfirm] = useState(false);

  async function refresh() {
    setLayoutElements(await actions.listLayoutElements(eventId, room.id));
  }

  // Guards against React StrictMode's dev-only double-invocation of this
  // effect: without this, initializeEventLayoutFromStandard's list-then-insert
  // can run twice concurrently before either write completes, silently
  // duplicating every copied-in standard element. Keyed by eventId+room.id so
  // a genuine room switch still re-initializes. (Carried over from the
  // original floor-plan-builder plan's live-verification fix.)
  const initializedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${eventId}:${room.id}`;
    if (initializedKeyRef.current === key) return;
    initializedKeyRef.current = key;
    if (skipInitialization) {
      setCanUndo(true);
      if (actions.getConfirmedAt) {
        actions.getConfirmedAt(eventId, room.id).then(setConfirmedAt);
      }
      return;
    }
    (async () => {
      const initial = await actions.initializeFromStandard(eventId, room.id);
      setLayoutElements(initial);
      await actions.captureSnapshot(eventId, room.id);
      setCanUndo(true);
      if (actions.getConfirmedAt) {
        setConfirmedAt(await actions.getConfirmedAt(eventId, room.id));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, room.id]);

  async function handleToggleConfirm() {
    if (!actions.confirm || !actions.unconfirm) return;
    setError(null);
    setIsTogglingConfirm(true);
    try {
      if (confirmedAt) {
        await actions.unconfirm(eventId, room.id);
        setConfirmedAt(null);
      } else {
        await actions.confirm(eventId, room.id);
        setConfirmedAt(await actions.getConfirmedAt!(eventId, room.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update confirmation. Please try again.");
    } finally {
      setIsTogglingConfirm(false);
    }
  }

  function tablesPlacedForType(tableTypeId: string): number {
    return layoutElements.filter((el) => el.element_type === "table" && el.table_type_id === tableTypeId).length;
  }

  const seatedCount = layoutElements
    .filter((el) => el.element_type === "table")
    .reduce((sum, el) => {
      const tableType = el.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : null;
      return sum + (tableType?.seats ?? 0);
    }, 0);

  async function handleAddMovable(type: LayoutElementType) {
    setError(null);
    try {
      const created = await actions.addElement({
        event_id: eventId,
        room_id: room.id,
        element_type: type,
        x_cm: Math.max(0, (room.width_cm - 200) / 2),
        y_cm: Math.max(0, (room.height_cm - 150) / 2),
        width_cm: 200,
        length_cm: 150,
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add element. Please try again.");
    }
  }

  async function handleAddTable(tableType: TableType) {
    setError(null);
    if (tablesPlacedForType(tableType.id) >= tableType.quantity) {
      setError(`All ${tableType.name} tables are already placed.`);
      return;
    }
    try {
      const created = await actions.addElement({
        event_id: eventId,
        room_id: room.id,
        element_type: "table",
        table_type_id: tableType.id,
        x_cm: Math.max(0, (room.width_cm - tableType.width_cm) / 2),
        y_cm: Math.max(0, (room.height_cm - tableType.length_cm) / 2),
        width_cm: tableType.width_cm,
        length_cm: tableType.length_cm,
        label: tableType.name,
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add table. Please try again.");
    }
  }

  async function handleMoveEnd(id: string, xCm: number, yCm: number) {
    if (fixedElements.some((el) => el.id === id)) return;
    setError(null);
    try {
      await actions.moveElement(id, xCm, yCm);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move element. Please try again.");
    }
  }

  async function handleResizeEnd(id: string, widthCm: number, heightCm: number) {
    if (fixedElements.some((el) => el.id === id)) return;
    setError(null);
    try {
      await actions.resizeElement(id, widthCm, heightCm);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resize element. Please try again.");
    }
  }

  async function handleDelete(id: string) {
    if (fixedElements.some((el) => el.id === id)) return;
    setError(null);
    try {
      await actions.deleteElement(id);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete element. Please try again.");
    }
  }

  async function handleRotateEnd(id: string, rotationDeg: number) {
    if (fixedElements.some((el) => el.id === id)) return;
    setError(null);
    try {
      await actions.rotateElement(id, rotationDeg);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate element. Please try again.");
    }
  }

  async function handleRevert() {
    setError(null);
    try {
      await actions.revertToStandard(eventId, room.id);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revert to standard. Please try again.");
    }
  }

  async function handleUndo() {
    if (isUndoing) return;
    setError(null);
    setIsUndoing(true);
    try {
      await actions.undo(eventId, room.id);
      setCanUndo(false);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nothing to undo.");
    } finally {
      setIsUndoing(false);
    }
  }

  const canvasElements: CanvasElement[] = [
    ...fixedElements.map((el) => ({
      id: el.id,
      x_cm: el.x_cm,
      y_cm: el.y_cm,
      width_cm: el.width_cm,
      height_cm: el.height_cm,
      color: FIXED_TYPE_COLORS[el.element_type],
      label: el.label ?? el.element_type,
      shape: "rect" as const,
      locked: true,
      rotationDeg: el.rotation_deg,
    })),
    ...layoutElements.map((el) => {
      const tableType = el.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : null;
      const shape: "rect" | "circle" =
        el.element_type === "table" ? (tableType?.shape === "rectangular" ? "rect" : "circle") : "rect";
      return {
        id: el.id,
        x_cm: el.x_cm,
        y_cm: el.y_cm,
        width_cm: el.width_cm,
        height_cm: el.length_cm,
        color: MOVABLE_TYPE_COLORS[el.element_type],
        label: el.label ?? el.element_type,
        shape,
        rotationDeg: el.rotation_deg,
      };
    }),
  ];

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-block text-sm font-medium text-lilac-dark"
        >
          {backLabel}
        </button>
      ) : (
        <Link href={backHref} className="mb-4 inline-block text-sm font-medium text-lilac-dark">
          {backLabel}
        </Link>
      )}
      <h1 className="mb-1 font-display text-3xl text-neutral-900">{room.name} — Seating</h1>
      <p className="mb-1 text-sm text-neutral-500">{eventName}</p>
      <p className="mb-6 text-sm font-medium text-neutral-900">
        <span className="inline-flex items-center rounded-full bg-lilac-light px-3 py-1">{seatedCount} seated</span>
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => handleAddMovable("stage")} className={PALETTE_BUTTON_CLASS}>
          + Stage
        </button>
        <button type="button" onClick={() => handleAddMovable("dance_floor")} className={PALETTE_BUTTON_CLASS}>
          + Dance floor
        </button>
        <button type="button" onClick={() => handleAddMovable("bar_movable")} className={PALETTE_BUTTON_CLASS}>
          + Movable bar
        </button>
        {tableTypes.map((tt) => (
          <button
            key={tt.id}
            type="button"
            onClick={() => handleAddTable(tt)}
            disabled={tablesPlacedForType(tt.id) >= tt.quantity}
            className={PALETTE_BUTTON_CLASS}
          >
            + {tt.name} ({tablesPlacedForType(tt.id)}/{tt.quantity})
          </button>
        ))}
        <button type="button" onClick={handleRevert} className={PALETTE_BUTTON_CLASS}>
          Revert to standard
        </button>
        <button type="button" onClick={handleUndo} disabled={!canUndo || isUndoing} className={PALETTE_BUTTON_CLASS}>
          {isUndoing ? "Undoing..." : "Undo"}
        </button>
      </div>

      {actions.confirm ? (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleConfirm}
            disabled={isTogglingConfirm}
            className={
              confirmedAt
                ? "rounded-full bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                : "rounded-full bg-lilac-dark px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            }
          >
            {isTogglingConfirm
              ? "Се зачувува..."
              : confirmedAt
                ? "✓ Распоредот е потврден — кликни за промени"
                : "Потврди распоред"}
          </button>
          {confirmedAt ? (
            <span className="text-sm text-neutral-500">Локалот го гледа овој распоред.</span>
          ) : (
            <span className="text-sm text-neutral-500">Локалот сѐ уште не го гледа овој распоред.</span>
          )}
        </div>
      ) : null}

      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      <div className="overflow-x-auto">
        <FloorPlanCanvas
          widthCm={room.width_cm}
          heightCm={room.height_cm}
          elements={canvasElements}
          selectedElementId={selectedId}
          onSelect={setSelectedId}
          onMoveEnd={handleMoveEnd}
          onResizeEnd={handleResizeEnd}
          onRotateEnd={handleRotateEnd}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
