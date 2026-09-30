"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FloorPlanCanvas, type CanvasElement, type CanvasGroup } from "./FloorPlanCanvas";
import {
  FIXED_TYPE_COLORS,
  MOVABLE_TYPE_COLORS,
  FIXED_LABELS,
  MOVABLE_LABELS,
  TABLE_ROLE_LABELS,
  COUPLE_TABLE_COLOR,
  type TableRole,
  type FixedElement,
  type EventLayoutElement,
  type EventLayoutElementInput,
  type LayoutElementType,
} from "@/lib/venue/floorplan";
import { type Room, type TableType } from "@/lib/venue/rooms";
import { TableSeatsPanel } from "@/components/seating/TableSeatsPanel";
import { AllTablesView } from "@/components/seating/AllTablesView";
import { occupancyOf, OCCUPANCY_COLORS, OCCUPANCY_LABELS, type Occupancy } from "@/lib/seating/occupancy";
import { tableTitle, type RoomSeating, type SeatInput } from "@/lib/seating/types";
import { venueHistoryActions } from "@/lib/venue/floorplan-history";

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
  /** Free table label, e.g. "Кумови" or "12" (B4). Null clears it back to "Маса N". */
  relabelElement?: (id: string, label: string | null) => Promise<EventLayoutElement>;
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
  /** Multi-step history (0072). Absent: only the single legacy undo. */
  redo?: (eventId: string, roomId: string) => Promise<EventLayoutElement[]>;
  getHistoryState?: (eventId: string, roomId: string) => Promise<{ canUndo: boolean; canRedo: boolean }>;
  /** Table groups (B3): returns the room's elements afterwards. */
  group?: (eventId: string, roomId: string, elementIds: string[]) => Promise<EventLayoutElement[]>;
  ungroup?: (eventId: string, roomId: string, groupId: string) => Promise<EventLayoutElement[]>;
  /** Seat lists per table (S3). Absent: no seat panel. */
  getRoomSeating?: (eventId: string, roomId: string) => Promise<RoomSeating>;
  /** Couple only: replaces one table's list and returns the room's fresh seating. */
  saveTableSeats?: (roomId: string, elementId: string, seats: SeatInput[], expected: SeatInput[]) => Promise<RoomSeating>;
}

/** Staff's editor: live event layout with multi-step undo/redo (0072). */
export const venueSeatingActions: SeatingActions = venueHistoryActions;

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
  backLabel = "← Назад кон настани",
  onBack,
  initialSeating,
  seatingReadOnly = false,
  printLinks,
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
  initialSeating?: RoomSeating;
  /** Venue staff see the lists but cannot edit them (they cannot read the guest list). */
  seatingReadOnly?: boolean;
  /** B7: the printable A4 plan and per-table QR cards. */
  printLinks?: { plan: string; qr: string };
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
  const [seating, setSeating] = useState<RoomSeating | null>(initialSeating ?? null);
  const [showAllTables, setShowAllTables] = useState(false);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [isRedoing, setIsRedoing] = useState(false);
  const [groupMode, setGroupMode] = useState(false);
  const [groupPick, setGroupPick] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  // A refused save (e.g. another device saved first) reloads the list and says why.
  const [seatNotice, setSeatNotice] = useState<string | null>(null);
  const [seatVersion, setSeatVersion] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  async function refreshHistory() {
    if (actions.getHistoryState) setHistory(await actions.getHistoryState(eventId, room.id));
  }

  async function refresh() {
    setLayoutElements(await actions.listLayoutElements(eventId, room.id));
    await refreshHistory();
    // Layout edits add, drop or shrink tables; the server prunes seats.
    if (actions.getRoomSeating) setSeating(await actions.getRoomSeating(eventId, room.id));
  }

  function seatedAt(elementId: string): number {
    return seating?.seats.filter((s) => s.elementId === elementId).length ?? 0;
  }

  const selectedSeatTable = seating?.tables.find((t) => t.elementId === selectedId) ?? null;
  const selectedTable = layoutElements.find((el) => el.id === selectedId && el.element_type === "table") ?? null;

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
      refreshHistory();
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
      await refreshHistory();
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
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на потврдата. Обидете се повторно.");
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
      setError(err instanceof Error ? err.message : "Не успеа додавањето на елементот. Обидете се повторно.");
    }
  }

  /** Couple / head tables use a rectangular table type when the room has one. */
  const specialTableType = tableTypes.find((tt) => tt.shape === "rectangular") ?? tableTypes[0] ?? null;

  async function handleAddSpecialTable(role: Exclude<TableRole, "guest">) {
    if (!specialTableType) return;
    setError(null);
    try {
      const created = await actions.addElement({
        event_id: eventId,
        room_id: room.id,
        element_type: "table",
        table_type_id: specialTableType.id,
        table_role: role,
        x_cm: Math.max(0, (room.width_cm - specialTableType.width_cm) / 2),
        y_cm: 100,
        width_cm: specialTableType.width_cm,
        length_cm: specialTableType.length_cm,
        label: null,
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на масата. Обидете се повторно.");
    }
  }

  async function handleRelabel(id: string, label: string) {
    if (!actions.relabelElement) return;
    setError(null);
    try {
      await actions.relabelElement(id, label.trim() || null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на ознаката.");
    }
  }

  async function handleAddTable(tableType: TableType) {
    setError(null);
    if (tablesPlacedForType(tableType.id) >= tableType.quantity) {
      setError(`Сите маси од тип „${tableType.name}“ се веќе поставени.`);
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
        label: null,
        table_role: "guest",
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на масата. Обидете се повторно.");
    }
  }

  async function handleMoveEnd(id: string, xCm: number, yCm: number) {
    if (fixedElements.some((el) => el.id === id)) return;
    setError(null);
    try {
      await actions.moveElement(id, xCm, yCm);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа поместувањето на елементот. Обидете се повторно.");
    }
  }

  async function handleResizeEnd(id: string, widthCm: number, heightCm: number) {
    if (fixedElements.some((el) => el.id === id)) return;
    setError(null);
    try {
      await actions.resizeElement(id, widthCm, heightCm);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа менувањето на големината на елементот. Обидете се повторно.");
    }
  }

  async function handleDelete(id: string) {
    if (fixedElements.some((el) => el.id === id)) return;
    const seated = seatedAt(id);
    if (seated > 0 && !window.confirm(`Масата има ${seated} седнати гости. Нивните места ќе се ослободат.`)) return;
    setError(null);
    try {
      await actions.deleteElement(id);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на елементот. Обидете се повторно.");
    }
  }

  async function handleRotateEnd(id: string, rotationDeg: number) {
    if (fixedElements.some((el) => el.id === id)) return;
    setError(null);
    try {
      await actions.rotateElement(id, rotationDeg);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ротирањето на елементот. Обидете се повторно.");
    }
  }

  async function handleRevert() {
    const seated = seating?.seats.length ?? 0;
    // Standard tables get fresh ids, so every seat in the hall is freed (undo restores them).
    if (seated > 0 && !window.confirm(`Стандардниот распоред ги ослободува сите места во салата (${seated} седнати гости). Можете да ги вратите со „↶ Врати“.`)) return;
    setError(null);
    try {
      await actions.revertToStandard(eventId, room.id);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа враќањето на стандардниот распоред. Обидете се повторно.");
    }
  }

  async function handleUndo() {
    if (isUndoing) return;
    setError(null);
    setIsUndoing(true);
    try {
      await actions.undo(eventId, room.id);
      if (!actions.getHistoryState) setCanUndo(false);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Нема што да се врати.");
    } finally {
      setIsUndoing(false);
    }
  }

  async function handleRedo() {
    if (isRedoing || !actions.redo) return;
    setError(null);
    setIsRedoing(true);
    try {
      await actions.redo(eventId, room.id);
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Нема што да се повтори.");
    } finally {
      setIsRedoing(false);
    }
  }

  // Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, except while typing in a field.
  const undoRef = useRef(handleUndo);
  const redoRef = useRef(handleRedo);
  useEffect(() => {
    undoRef.current = handleUndo;
    redoRef.current = handleRedo;
  });
  useEffect(() => {
    if (!actions.getHistoryState) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redoRef.current();
      else undoRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [actions.getHistoryState]);

  function toggleGroupPick(id: string) {
    const el = layoutElements.find((e) => e.id === id);
    if (!el || el.element_type !== "table") return;
    setGroupPick((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleGroup() {
    if (!actions.group || groupPick.length < 2) return;
    setError(null);
    try {
      setLayoutElements(await actions.group(eventId, room.id, groupPick));
      setGroupMode(false);
      setGroupPick([]);
      await refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа групирањето на масите.");
    }
  }

  async function handleUngroup(groupId: string) {
    if (!actions.ungroup) return;
    setError(null);
    try {
      setLayoutElements(await actions.ungroup(eventId, room.id, groupId));
      await refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа разгрупирањето.");
    }
  }

  const selectedGroupId = layoutElements.find((el) => el.id === selectedId)?.group_id ?? null;

  function seatsOf(el: EventLayoutElement): number {
    const fromSeating = seating?.tables.find((t) => t.elementId === el.id)?.capacity;
    if (fromSeating !== undefined) return fromSeating;
    return tableTypes.find((tt) => tt.id === el.table_type_id)?.seats ?? 0;
  }

  const groupOutlines: CanvasGroup[] = Object.entries(
    layoutElements.reduce<Record<string, EventLayoutElement[]>>((acc, el) => {
      if (el.group_id) (acc[el.group_id] ??= []).push(el);
      return acc;
    }, {}),
  ).map(([id, members]) => {
    const x = Math.min(...members.map((m) => m.x_cm));
    const y = Math.min(...members.map((m) => m.y_cm));
    return {
      id,
      x_cm: x,
      y_cm: y,
      width_cm: Math.max(...members.map((m) => m.x_cm + m.width_cm)) - x,
      height_cm: Math.max(...members.map((m) => m.y_cm + m.length_cm)) - y,
      label: `Група · ${members.reduce((sum, m) => sum + seatsOf(m), 0)} места`,
    };
  });

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
    ...layoutElements.map((el) => {
      const tableType = el.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : null;
      const seatTable = seating?.tables.find((t) => t.elementId === el.id);
      const occupancy = seatTable ? occupancyOf(seatTable.capacity, seatedAt(el.id)) : undefined;
      const shape: "rect" | "circle" =
        el.element_type === "table" ? (tableType?.shape === "rectangular" ? "rect" : "circle") : "rect";
      const role = el.table_role ?? "guest";
      const label = seatTable
        ? tableTitle(seatTable)
        : el.element_type === "table" && role !== "guest"
          ? (el.label ?? TABLE_ROLE_LABELS[role])
          : (el.label ?? MOVABLE_LABELS[el.element_type]);
      return {
        id: el.id,
        x_cm: el.x_cm,
        y_cm: el.y_cm,
        width_cm: el.width_cm,
        height_cm: el.length_cm,
        color:
          el.element_type === "table" && role === "couple"
            ? COUPLE_TABLE_COLOR
            : occupancy
              ? OCCUPANCY_COLORS[occupancy]
              : MOVABLE_TYPE_COLORS[el.element_type],
        occupancy,
        badge: seatTable ? `${seatedAt(el.id)}/${seatTable.capacity}` : undefined,
        label,
        shape,
        rotationDeg: el.rotation_deg,
        highlighted: showAllTables && el.id === highlightedId,
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
      <h1 className="mb-1 font-display text-3xl text-neutral-900">{room.name} — Распоред на маси</h1>
      <p className="mb-1 text-sm text-neutral-500">{eventName}</p>
      <p className="mb-6 text-sm font-medium text-neutral-900">
        <span className="inline-flex items-center rounded-full bg-lilac-light px-3 py-1">{seatedCount} седишта</span>
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => handleAddMovable("stage")} className={PALETTE_BUTTON_CLASS}>
          + Бина
        </button>
        <button type="button" onClick={() => handleAddMovable("dance_floor")} className={PALETTE_BUTTON_CLASS}>
          + Танц подиум
        </button>
        <button type="button" onClick={() => handleAddMovable("bar_movable")} className={PALETTE_BUTTON_CLASS}>
          + Шанк
        </button>
        <button type="button" onClick={() => handleAddMovable("music")} className={PALETTE_BUTTON_CLASS}>
          + Музика
        </button>
        <button type="button" onClick={() => handleAddMovable("photo_stage")} className={PALETTE_BUTTON_CLASS}>
          + Бина за сликање
        </button>
        <button type="button" onClick={() => handleAddSpecialTable("couple")} disabled={!specialTableType} className={PALETTE_BUTTON_CLASS}>
          + Маса на младенците
        </button>
        <button type="button" onClick={() => handleAddSpecialTable("head")} disabled={!specialTableType} className={PALETTE_BUTTON_CLASS}>
          + Главна маса
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
          Врати на стандарден распоред
        </button>
        {actions.getHistoryState ? (
          <>
            <button type="button" onClick={handleUndo} disabled={!history.canUndo || isUndoing} className={PALETTE_BUTTON_CLASS} title="Ctrl+Z">
              ↶ Врати
            </button>
            <button type="button" onClick={handleRedo} disabled={!history.canRedo || isRedoing} className={PALETTE_BUTTON_CLASS} title="Shift+Ctrl+Z">
              ↷ Повтори
            </button>
          </>
        ) : (
          <button type="button" onClick={handleUndo} disabled={!canUndo || isUndoing} className={PALETTE_BUTTON_CLASS}>
            {isUndoing ? "Се враќа..." : "Врати"}
          </button>
        )}
        {actions.group ? (
          groupMode ? (
            <>
              <button type="button" onClick={handleGroup} disabled={groupPick.length < 2} className={PALETTE_BUTTON_CLASS}>
                Групирај ({groupPick.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setGroupMode(false);
                  setGroupPick([]);
                }}
                className={PALETTE_BUTTON_CLASS}
              >
                Откажи
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setGroupMode(true);
                setSelectedId(null);
              }}
              className={PALETTE_BUTTON_CLASS}
            >
              + Групирај маси
            </button>
          )
        ) : null}
        {actions.ungroup && selectedGroupId && !groupMode ? (
          <button type="button" onClick={() => handleUngroup(selectedGroupId)} className={PALETTE_BUTTON_CLASS}>
            Разгрупирај
          </button>
        ) : null}
        {seating ? (
          <button
            type="button"
            aria-pressed={showAllTables}
            onClick={() => {
              setShowAllTables((v) => !v);
              setHighlightedId(null);
            }}
            className={PALETTE_BUTTON_CLASS}
          >
            Сите маси
          </button>
        ) : null}
      </div>

      {printLinks ? (
        <div className="mb-3 flex flex-wrap gap-2">
          <Link href={printLinks.plan} className={PALETTE_BUTTON_CLASS} target="_blank">
            Печати план
          </Link>
          <Link href={printLinks.qr} className={PALETTE_BUTTON_CLASS} target="_blank">
            QR по маса
          </Link>
        </div>
      ) : null}

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

      <div className="mb-2 flex items-center gap-1" role="group" aria-label="Зум">
        <button type="button" aria-label="Одзумирај" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className={PALETTE_BUTTON_CLASS}>
          −
        </button>
        <button type="button" onClick={() => setZoom(1)} className={PALETTE_BUTTON_CLASS}>
          100%
        </button>
        <button type="button" aria-label="Зумирај" onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))} className={PALETTE_BUTTON_CLASS}>
          +
        </button>
        <span className="ml-1 text-xs text-neutral-500">{Math.round(zoom * 100)}%</span>
      </div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <FloorPlanCanvas
          widthCm={room.width_cm}
          heightCm={room.height_cm}
          elements={canvasElements}
          selectedElementId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            setSeatNotice(null);
          }}
          onMoveEnd={handleMoveEnd}
          onResizeEnd={handleResizeEnd}
          onRotateEnd={handleRotateEnd}
          onDelete={handleDelete}
          mode={groupMode ? "select" : "edit"}
          selectedIds={groupPick}
          onToggleSelect={toggleGroupPick}
          groups={groupOutlines}
          zoom={zoom}
        />
      </div>
      {selectedTable ? (
        <div className="max-h-[50vh] space-y-3 overflow-auto lg:max-h-none lg:w-80 lg:shrink-0">
          {actions.relabelElement ? (
            <form
              key={`label:${selectedTable.id}:${selectedTable.label ?? ""}`}
              className="flex items-end gap-2 rounded-2xl border border-neutral-200 bg-white p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const field = e.currentTarget.elements.namedItem("table-label") as HTMLInputElement;
                handleRelabel(selectedTable.id, field.value);
              }}
            >
              <label className="flex-1 text-sm text-neutral-600">
                Ознака на масата
                <input
                  name="table-label"
                  defaultValue={selectedTable.label ?? ""}
                  placeholder="на пр. 12 или Кумови"
                  maxLength={200}
                  className="mt-1 block w-full rounded-lg border border-neutral-200 px-2 py-1 text-sm text-neutral-900"
                />
              </label>
              <button type="submit" className="rounded-full border border-neutral-200 px-3 py-1 text-sm font-medium text-neutral-700 hover:border-lilac-dark">
                Зачувај ознака
              </button>
            </form>
          ) : null}
          {selectedSeatTable && seating ? (
          <>
          {seatNotice ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{seatNotice}</p> : null}
          <TableSeatsPanel
            key={`${selectedSeatTable.elementId}:${selectedSeatTable.capacity}:${seatVersion}`}
            table={selectedSeatTable}
            seats={seating.seats.filter((s) => s.elementId === selectedSeatTable.elementId)}
            guests={seating.guests}
            readOnly={seatingReadOnly || !actions.saveTableSeats}
            onClose={() => setSelectedId(null)}
            onSave={async (seats) => {
              const loaded = seating.seats
                .filter((s) => s.elementId === selectedSeatTable.elementId)
                .map((s) => ({ seatNumber: s.seatNumber, guestId: s.guestId, guestName: s.guestId ? null : s.guestName }));
              setSeatNotice(null);
              try {
                setSeating(await actions.saveTableSeats!(room.id, selectedSeatTable.elementId, seats, loaded));
                await refreshHistory();
              } catch (err) {
                if (actions.getRoomSeating) setSeating(await actions.getRoomSeating(eventId, room.id));
                setSeatVersion((v) => v + 1);
                setSeatNotice(err instanceof Error ? err.message : "Не успеа зачувувањето на листата.");
              }
            }}
          />
          </>
          ) : null}
        </div>
      ) : null}
      </div>
      {seating ? (
        <ul aria-label="Легенда" className="mt-3 flex flex-wrap gap-4 text-sm text-neutral-600">
          {(Object.keys(OCCUPANCY_COLORS) as Occupancy[]).map((o) => (
            <li key={o} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ background: OCCUPANCY_COLORS[o] }} />
              {OCCUPANCY_LABELS[o]}
            </li>
          ))}
        </ul>
      ) : null}
      {showAllTables && seating ? (
        <AllTablesView roomName={room.name} seating={seating} highlightedId={highlightedId} onHighlight={setHighlightedId} />
      ) : null}
    </div>
  );
}
