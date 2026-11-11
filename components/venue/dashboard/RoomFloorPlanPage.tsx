"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/venue/shell/Icon";
import { FloorPlanCanvas, PX_PER_CM, type CanvasElement } from "./FloorPlanCanvas";
import { fitZoom } from "@/lib/seating/zoom-to-fit";
import {
  addFixedElement,
  updateFixedElementPosition,
  updateFixedElementSize,
  updateFixedElementRotation,
  deleteFixedElement,
  verifyLayoutLockPassword,
  updateRoomDimensions,
  addRoomLayoutElement,
  updateRoomLayoutElementPosition,
  updateRoomLayoutElementSize,
  updateRoomLayoutElementRotation,
  deleteRoomLayoutElement,
  listFixedElements,
  listRoomLayoutElements,
  numberTables,
  FIXED_TYPE_COLORS,
  MOVABLE_TYPE_COLORS,
  FIXED_LABELS,
  MOVABLE_LABELS,
  TABLE_ROLE_LABELS,
  COUPLE_TABLE_COLOR,
  CREW_TABLE_COLOR,
  type TableRole,
  type FixedElement,
  type FixedElementType,
  type RoomLayoutElement,
  type LayoutElementType,
} from "@/lib/venue/floorplan";
import {
  listTableTypes,
  updateRoomName,
  deleteRoom,
  deleteTableType,
  seatsAffectedByTableType,
  roomUsage,
  type Room,
  type TableType,
} from "@/lib/venue/rooms";
import { errorMessage } from "@/lib/venue/user-error";
import { todayIn, VENUE_TIME_ZONE } from "@/lib/date";
import { openSpot } from "@/lib/venue/open-spot";
import { listRoomPresets, saveRoomPreset, loadRoomPreset, type RoomPreset } from "@/lib/venue/room-presets";
import { recordAroundRoom, undoRoomStep, redoRoomStep, roomHistoryStepState } from "@/lib/venue/room-layout-history";
import { useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";
import { getVenueLogoUrl } from "@/lib/venue/venue-profile";
import { Modal } from "./Modal";
import { TableTypeForm } from "@/components/venue/TableTypeForm";

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.4;
const ZOOM_STEP = 0.15;

/** Purely decorative gold corner flourish for the canvas frame — never
 * intercepts pointer events, so it can't interfere with dragging elements. */
function CanvasCorner({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 64 40" className="rp-canvas-corner" style={flip ? { transform: "scaleX(-1)" } : undefined} aria-hidden>
      <path d="M2 36c16-2 29-12 36-30" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
      <ellipse cx="16" cy="27" rx="5.2" ry="2.6" transform="rotate(-38 16 27)" fill="currentColor" />
      <ellipse cx="27" cy="16" rx="4.6" ry="2.3" transform="rotate(-38 27 16)" fill="currentColor" />
      <ellipse cx="36" cy="7" rx="3.8" ry="1.9" transform="rotate(-38 36 7)" fill="currentColor" />
    </svg>
  );
}

type DecorationInput = { label: string; shape: "round" | "rectangular"; widthCm: number; lengthCm: number };

/** A flower arrangement, lanterns, or anything else with a shape but no
 * chairs — unlike a table type, this is placed once per submit, not saved
 * as a reusable catalog entry. */
function DecorationForm({ onAdd, onCancel }: { onAdd: (input: DecorationInput) => void; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [shape, setShape] = useState<DecorationInput["shape"]>("round");
  const [widthCm, setWidthCm] = useState(60);
  const [lengthCm, setLengthCm] = useState(60);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;
    onAdd({ label: label.trim(), shape, widthCm, lengthCm });
  }

  return (
    <form onSubmit={handleSubmit} className="ev-form">
      <div className="ev-form-grid">
        <div className="ev-field ev-field-wide">
          <label className="lab-s" htmlFor="decoration-label">
            Име <span className="req">*</span>
          </label>
          <input id="decoration-label" className="fld" placeholder="пр. Цвеќиња" value={label} onChange={(e) => setLabel(e.target.value)} required />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="decoration-shape">
            Облик
          </label>
          <select id="decoration-shape" className="fld" value={shape} onChange={(e) => setShape(e.target.value as DecorationInput["shape"])}>
            <option value="round">Тркалезна</option>
            <option value="rectangular">Правоаголна</option>
          </select>
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="decoration-width">
            Ширина (см)
          </label>
          <input id="decoration-width" className="fld" type="number" min={1} value={widthCm} onChange={(e) => setWidthCm(Number(e.target.value))} />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="decoration-length">
            Должина (см)
          </label>
          <input id="decoration-length" className="fld" type="number" min={1} value={lengthCm} onChange={(e) => setLengthCm(Number(e.target.value))} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-gold">
          Додај
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Откажи
        </button>
      </div>
    </form>
  );
}

export function RoomFloorPlanPage({
  venueId,
  room,
  rooms,
  initialFixedElements,
  initialLayoutElements,
  initialTableTypes,
}: {
  venueId: string;
  room: Room;
  /** Every room in the venue, for the room-switcher dropdown. */
  rooms: Room[];
  initialFixedElements: FixedElement[];
  initialLayoutElements: RoomLayoutElement[];
  initialTableTypes: TableType[];
}) {
  const router = useRouter();
  const [fixedElements, setFixedElements] = useState(initialFixedElements);
  const [layoutElements, setLayoutElements] = useState(initialLayoutElements);
  const [tableTypes, setTableTypes] = useState(initialTableTypes);
  const [showAddTableType, setShowAddTableType] = useState(false);
  const [addMode, setAddMode] = useState<"table" | "decoration">("table");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [widthCm, setWidthCm] = useState(room.width_cm);
  const [heightCm, setHeightCm] = useState(room.height_cm);
  const [widthM, setWidthM] = useState(String(room.width_cm / 100));
  const [heightM, setHeightM] = useState(String(room.height_cm / 100));
  const [dimensionsError, setDimensionsError] = useState<string | null>(null);
  const [dimensionsSaved, setDimensionsSaved] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [presets, setPresets] = useState<RoomPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetSaved, setPresetSaved] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  const [isEditingRoomName, setIsEditingRoomName] = useState(false);
  const [roomNameInput, setRoomNameInput] = useState(room.name);
  const [isSavingRoomName, setIsSavingRoomName] = useState(false);
  const [roomNameError, setRoomNameError] = useState<string | null>(null);
  const [confirmingDeleteRoom, setConfirmingDeleteRoom] = useState(false);
  const [roomUsageInfo, setRoomUsageInfo] = useState<{ events: number; reservations: number } | null>(null);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [deleteRoomError, setDeleteRoomError] = useState<string | null>(null);
  const [openTileMenuId, setOpenTileMenuId] = useState<string | null>(null);
  const openTileMenuRef = useRef<HTMLDivElement | null>(null);
  const [editingTableTypeId, setEditingTableTypeId] = useState<string | null>(null);
  const [confirmingDeleteTableTypeId, setConfirmingDeleteTableTypeId] = useState<string | null>(null);
  const [deleteTableTypeError, setDeleteTableTypeError] = useState<string | null>(null);
  useEffect(() => {
    if (!openTileMenuId) return;
    function onDocMouseDown(e: MouseEvent) {
      if (openTileMenuRef.current && !openTileMenuRef.current.contains(e.target as Node)) {
        setOpenTileMenuId(null);
        setConfirmingDeleteTableTypeId(null);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [openTileMenuId]);
  const { managerName } = useManagerElevation();
  const isManager = managerName !== null;

  // Project C: a wide room starts zoomed to fit the visible width instead of
  // overflowing into a horizontal scrollbar at 100% — already wired into the
  // event-seating, reservations and new-event-wizard canvases; this was the
  // one canvas (the room-template/preset editor) that got missed. Fit once
  // per room, not a live-resize behaviour — the manual +/- buttons and the
  // re-fit after saving new dimensions below still work from there.
  const [zoom, setZoom] = useState(1);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    setZoom(fitZoom(widthCm, PX_PER_CM, el.clientWidth, ZOOM_MIN));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    function onChange() {
      setIsFullscreen(document.fullscreenElement === canvasWrapRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void canvasWrapRef.current?.requestFullscreen();
    }
  }

  // Project C: the venue's own logo, watermarked over the floor plan.
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    getVenueLogoUrl(venueId)
      .then(setLogoUrl)
      .catch(() => {});
  }, [venueId]);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  async function refresh() {
    setFixedElements(await listFixedElements(room.id));
    setLayoutElements(await listRoomLayoutElements(room.id));
    setPresets(await listRoomPresets(room.id));
    setHistory(await roomHistoryStepState(room.id));
  }

  async function handleUndo() {
    setHistoryError(null);
    setIsUndoing(true);
    try {
      const { elements, fixed } = await undoRoomStep(room.id);
      setLayoutElements(elements);
      setFixedElements(fixed);
      setHistory(await roomHistoryStepState(room.id));
    } catch (err) {
      setHistoryError(errorMessage(err, "Не успеа враќањето. Обидете се повторно."));
    } finally {
      setIsUndoing(false);
    }
  }

  async function handleRedo() {
    setHistoryError(null);
    setIsRedoing(true);
    try {
      const { elements, fixed } = await redoRoomStep(room.id);
      setLayoutElements(elements);
      setFixedElements(fixed);
      setHistory(await roomHistoryStepState(room.id));
    } catch (err) {
      setHistoryError(errorMessage(err, "Не успеа повторувањето. Обидете се повторно."));
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
  }, []);

  async function handleSavePreset(e: React.FormEvent) {
    e.preventDefault();
    setPresetError(null);
    setPresetSaved(false);
    const name = presetName.trim();
    if (!name) {
      setPresetError("Внесете име за планот.");
      return;
    }
    setPresetBusy(true);
    try {
      await saveRoomPreset(room.id, name);
      setPresets(await listRoomPresets(room.id));
      setPresetName("");
      setPresetSaved(true);
    } catch (err) {
      setPresetError(errorMessage(err, "Планот не можеше да се зачува."));
    } finally {
      setPresetBusy(false);
    }
  }

  async function handleLoadPreset() {
    setPresetError(null);
    setPresetSaved(false);
    if (!selectedPresetId) return;
    if (!window.confirm("Со ова ќе се замени тековниот распоред на масите со избраниот план (можете да го вратите со „Врати“). Продолжи?")) return;
    setPresetBusy(true);
    try {
      await recordAroundRoom(room.id, () => loadRoomPreset(selectedPresetId, room.id));
      await refresh();
    } catch (err) {
      setPresetError(errorMessage(err, "Планот не можеше да се вчита."));
    } finally {
      setPresetBusy(false);
    }
  }

  // The initial*Elements props only reflect the state at the moment this page
  // was server-rendered. Next.js's client-side Router Cache can restore a
  // stale snapshot of this render on browser back/forward navigation without
  // re-fetching, so this page's own data can silently go out of date. Fetch
  // fresh directly from Supabase on every mount to guarantee the canvas
  // always reflects the true current layout, independent of that cache.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  // De-elevating mid-session (e.g. "Одјави менаџер") drops access to the
  // fixed-layout unlock too — a plain staff session should never keep it open.
  useEffect(() => {
    if (!isManager) setIsUnlocked(false);
  }, [isManager]);

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (!isManager) return;
    const ok = await verifyLayoutLockPassword(venueId, passwordInput);
    if (ok) {
      setIsUnlocked(true);
      setPasswordInput("");
    } else {
      setPasswordError("Погрешна лозинка. Ако сè уште немате лозинка, поставете ја во Поставки.");
    }
  }

  function tablesPlacedForType(tableTypeId: string): number {
    return layoutElements.filter((el) => el.element_type === "table" && el.table_type_id === tableTypeId).length;
  }

  async function handleAddFixed(type: FixedElementType) {
    setActionError(null);
    try {
      const created = await recordAroundRoom(room.id, () =>
        addFixedElement({
          room_id: room.id,
          element_type: type,
          ...openSpot(
            { x_cm: Math.max(0, (widthCm - 100) / 2), y_cm: Math.max(0, (heightCm - 20) / 2) },
            { width_cm: 100, length_cm: 20 },
            { width_cm: widthCm, height_cm: heightCm },
            [...fixedElements, ...layoutElements],
          ),
          width_cm: 100,
          height_cm: 20,
        }),
      );
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа додавањето на елементот. Обидете се повторно."));
    }
  }

  async function handleAddMovable(type: LayoutElementType) {
    setActionError(null);
    try {
      const created = await recordAroundRoom(room.id, () =>
        addRoomLayoutElement({
          room_id: room.id,
          element_type: type,
          ...openSpot(
            { x_cm: Math.max(0, (widthCm - 200) / 2), y_cm: Math.max(0, (heightCm - 150) / 2) },
            { width_cm: 200, length_cm: 150 },
            { width_cm: widthCm, height_cm: heightCm },
            [...fixedElements, ...layoutElements],
          ),
          width_cm: 200,
          length_cm: 150,
        }),
      );
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа додавањето на елементот. Обидете се повторно."));
    }
  }

  /** Couple / head tables use a rectangular table type when the room has one. */
  const specialTableType = tableTypes.find((tt) => tt.shape === "rectangular") ?? tableTypes[0] ?? null;

  async function handleAddSpecialTable(role: Exclude<TableRole, "guest">) {
    if (!specialTableType) return;
    setActionError(null);
    try {
      const created = await recordAroundRoom(room.id, () =>
        addRoomLayoutElement({
          room_id: room.id,
          element_type: "table",
          table_type_id: specialTableType.id,
          table_role: role,
          ...openSpot(
            { x_cm: Math.max(0, (widthCm - specialTableType.width_cm) / 2), y_cm: 100 },
            { width_cm: specialTableType.width_cm, length_cm: specialTableType.length_cm },
            { width_cm: widthCm, height_cm: heightCm },
            [...fixedElements, ...layoutElements],
          ),
          width_cm: specialTableType.width_cm,
          length_cm: specialTableType.length_cm,
          label: null,
        }),
      );
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа додавањето на масата. Обидете се повторно."));
    }
  }

  async function handleAddDecoration(input: DecorationInput) {
    setActionError(null);
    try {
      const created = await recordAroundRoom(room.id, () =>
        addRoomLayoutElement({
          room_id: room.id,
          element_type: "other",
          label: input.label,
          shape: input.shape,
          ...openSpot(
            { x_cm: Math.max(0, (widthCm - input.widthCm) / 2), y_cm: Math.max(0, (heightCm - input.lengthCm) / 2) },
            { width_cm: input.widthCm, length_cm: input.lengthCm },
            { width_cm: widthCm, height_cm: heightCm },
            [...fixedElements, ...layoutElements],
          ),
          width_cm: input.widthCm,
          length_cm: input.lengthCm,
        }),
      );
      await refresh();
      setSelectedId(created.id);
      setShowAddTableType(false);
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа додавањето на елементот. Обидете се повторно."));
    }
  }

  async function handleAddTable(tableType: TableType) {
    setActionError(null);
    if (tablesPlacedForType(tableType.id) >= tableType.quantity) {
      setActionError(`Сите маси од видот „${tableType.name}“ се веќе поставени.`);
      return;
    }
    try {
      const created = await recordAroundRoom(room.id, () =>
        addRoomLayoutElement({
          room_id: room.id,
          element_type: "table",
          table_type_id: tableType.id,
          ...openSpot(
            { x_cm: Math.max(0, (widthCm - tableType.width_cm) / 2), y_cm: Math.max(0, (heightCm - tableType.length_cm) / 2) },
            { width_cm: tableType.width_cm, length_cm: tableType.length_cm },
            { width_cm: widthCm, height_cm: heightCm },
            [...fixedElements, ...layoutElements],
          ),
          width_cm: tableType.width_cm,
          length_cm: tableType.length_cm,
          label: null,
          table_role: "guest",
        }),
      );
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа додавањето на масата. Обидете се повторно."));
    }
  }

  async function handleMoveEnd(id: string, xCm: number, yCm: number) {
    setActionError(null);
    try {
      const isFixed = fixedElements.some((el) => el.id === id);
      if (isFixed) {
        if (!isManager || !isUnlocked) return;
        await recordAroundRoom(room.id, () => updateFixedElementPosition(id, xCm, yCm));
      } else {
        await recordAroundRoom(room.id, () => updateRoomLayoutElementPosition(id, xCm, yCm));
      }
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа поместувањето на елементот. Обидете се повторно."));
    }
  }

  async function handleResizeEnd(id: string, w: number, h: number) {
    setActionError(null);
    try {
      const isFixed = fixedElements.some((el) => el.id === id);
      if (isFixed) {
        if (!isManager || !isUnlocked) return;
        await recordAroundRoom(room.id, () => updateFixedElementSize(id, w, h));
      } else {
        await recordAroundRoom(room.id, () => updateRoomLayoutElementSize(id, w, h));
      }
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа менувањето на големината. Обидете се повторно."));
    }
  }

  async function handleDelete(id: string) {
    setActionError(null);
    try {
      const isFixed = fixedElements.some((el) => el.id === id);
      if (isFixed) {
        if (!isManager || !isUnlocked) return;
        await recordAroundRoom(room.id, () => deleteFixedElement(id));
      } else {
        await recordAroundRoom(room.id, () => deleteRoomLayoutElement(id));
      }
      setSelectedId(null);
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа бришењето на елементот. Обидете се повторно."));
    }
  }

  async function handleRotateEnd(id: string, rotationDeg: number) {
    setActionError(null);
    try {
      const isFixed = fixedElements.some((el) => el.id === id);
      if (isFixed) {
        if (!isManager || !isUnlocked) return;
        await recordAroundRoom(room.id, () => updateFixedElementRotation(id, rotationDeg));
      } else {
        await recordAroundRoom(room.id, () => updateRoomLayoutElementRotation(id, rotationDeg));
      }
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа ротирањето на елементот. Обидете се повторно."));
    }
  }

  async function handleSaveRoomName(e: React.FormEvent) {
    e.preventDefault();
    setRoomNameError(null);
    setIsSavingRoomName(true);
    try {
      await updateRoomName(room.id, roomNameInput);
      setIsEditingRoomName(false);
      router.refresh();
    } catch (err) {
      setRoomNameError(errorMessage(err, "Не успеа преименувањето. Обидете се повторно."));
    } finally {
      setIsSavingRoomName(false);
    }
  }

  function startDeleteRoomConfirm() {
    setDeleteRoomError(null);
    setConfirmingDeleteRoom(true);
    roomUsage(room.id, todayIn(VENUE_TIME_ZONE))
      .then(setRoomUsageInfo)
      .catch(() => setRoomUsageInfo(null));
  }

  async function handleDeleteRoom() {
    setDeleteRoomError(null);
    setIsDeletingRoom(true);
    try {
      await deleteRoom(room.id);
      router.push("/venue/tables");
    } catch (err) {
      setDeleteRoomError(errorMessage(err, "Не успеа бришењето на просторијата. Обидете се повторно."));
      setIsDeletingRoom(false);
    }
  }

  async function handleTableTypeEdited() {
    setTableTypes(await listTableTypes(room.id));
    setEditingTableTypeId(null);
  }

  async function handleDeleteTableType(tableTypeId: string) {
    setDeleteTableTypeError(null);
    try {
      const affected = await seatsAffectedByTableType(tableTypeId, null);
      if (affected > 0 && !window.confirm(`${affected} седнати гости се на маси од овој вид и ќе го изгубат местото. Продолжи?`)) return;
      await deleteTableType(tableTypeId);
      setConfirmingDeleteTableTypeId(null);
      setOpenTileMenuId(null);
      setTableTypes(await listTableTypes(room.id));
    } catch (err) {
      setDeleteTableTypeError(errorMessage(err, "Не успеа бришењето на видот маса. Обидете се повторно."));
    }
  }

  async function handleSaveDimensions(e: React.FormEvent) {
    e.preventDefault();
    setDimensionsError(null);
    setDimensionsSaved(false);
    const nextWidthCm = Number(widthM) * 100;
    const nextHeightCm = Number(heightM) * 100;
    if (!Number.isFinite(nextWidthCm) || nextWidthCm <= 0 || !Number.isFinite(nextHeightCm) || nextHeightCm <= 0) {
      setDimensionsError("Внесете важечка ширина и длабочина.");
      return;
    }
    // Shrinking the room under what is already placed would leave those
    // elements outside the plan, where they can no longer be reached.
    const outside = [
      ...fixedElements.map((el) => ({ right: el.x_cm + el.width_cm, bottom: el.y_cm + el.height_cm })),
      ...layoutElements.map((el) => ({ right: el.x_cm + el.width_cm, bottom: el.y_cm + el.length_cm })),
    ].filter((el) => el.right > nextWidthCm || el.bottom > nextHeightCm).length;
    if (outside > 0) {
      setDimensionsError(`${outside} ${outside === 1 ? "елемент би останал" : "елементи би останале"} надвор од просторијата. Прво поместете ги поблиску до горниот лев агол.`);
      return;
    }
    try {
      await updateRoomDimensions(room.id, nextWidthCm, nextHeightCm);
      setWidthCm(nextWidthCm);
      setHeightCm(nextHeightCm);
      setDimensionsSaved(true);
      // The room's own width just changed, so the zoom level that fit before
      // may not anymore — re-fit rather than leaving a now-wrong zoom in place.
      if (canvasWrapRef.current) {
        setZoom(fitZoom(nextWidthCm, PX_PER_CM, canvasWrapRef.current.clientWidth, ZOOM_MIN));
      }
    } catch (err) {
      setDimensionsError(errorMessage(err, "Не успеа зачувувањето на големината. Обидете се повторно."));
    }
  }

  const tableNumbers = useMemo(() => numberTables(layoutElements), [layoutElements]);

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
      locked: !isUnlocked,
      rotationDeg: el.rotation_deg,
    })),
    ...layoutElements.map((el) => {
      const tableType = el.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : null;
      const shape: "rect" | "circle" =
        el.element_type === "table"
          ? tableType?.shape === "rectangular"
            ? "rect"
            : "circle"
          : el.shape === "round"
            ? "circle"
            : "rect";
      const tableNumber = tableNumbers.get(el.id);
      const role = el.table_role ?? "guest";
      const label =
        el.element_type === "table" && role !== "guest"
          ? (el.label ?? TABLE_ROLE_LABELS[role])
          : el.element_type === "table" && tableNumber != null
          ? tableType
            ? `Маса ${tableNumber} (${tableType.seats})`
            : `Маса ${tableNumber}`
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
            : el.element_type === "table" && role === "crew"
              ? CREW_TABLE_COLOR
              : MOVABLE_TYPE_COLORS[el.element_type],
        label,
        shape,
        rotationDeg: el.rotation_deg,
        seatCount: el.element_type === "table" ? tableType?.seats : undefined,
      };
    }),
  ];

  return (
    <div className="wrap">
      <div className="actions">
        <Link href="/venue/tables" className="btn btn-ghost">
          <Icon name="left" size="sm" /> Назад кон простории
        </Link>
      </div>

      <section className="panel rp-panel">
        <div className="panel-h">
          <div className="rp-head-room">
            <select
              className="rp-room-switch"
              aria-label="Префрли просторија"
              value={room.id}
              onChange={(e) => router.push(`/venue/rooms/${e.target.value}/floor-plan`)}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <span className="rp-dims-badge">
              <Icon name="expand" size="sm" /> {widthCm / 100} м × {heightCm / 100} м
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setRoomNameError(null);
                setRoomNameInput(room.name);
                setIsEditingRoomName(true);
              }}
              aria-label="Преименувај просторија"
            >
              <Icon name="edit" size="sm" />
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: "var(--bad)" }}
              onClick={startDeleteRoomConfirm}
              aria-label="Избриши просторија"
            >
              <Icon name="trash" size="sm" />
            </button>
          </div>
          <div className="qb-floor-actions">
            <Link href={`/venue/rooms/${room.id}/print`} className="btn btn-ghost" target="_blank">
              <Icon name="copy" size="sm" /> Печати план
            </Link>
            {isUnlocked ? (
              <button type="button" className="btn btn-ghost" onClick={() => setIsUnlocked(false)}>
                Заклучи
              </button>
            ) : null}
          </div>
        </div>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {isEditingRoomName ? (
            <form onSubmit={handleSaveRoomName} className="rp-presets">
              <div className="ev-field" style={{ flex: "0 1 260px" }}>
                <label className="lab-s" htmlFor="room-name">
                  Име на просторијата
                </label>
                <input
                  id="room-name"
                  className="fld"
                  value={roomNameInput}
                  onChange={(e) => setRoomNameInput(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-gold" disabled={isSavingRoomName}>
                {isSavingRoomName ? "Се зачувува..." : "Зачувај"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setIsEditingRoomName(false)} disabled={isSavingRoomName}>
                Откажи
              </button>
            </form>
          ) : null}
          {roomNameError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{roomNameError}</p> : null}

          {confirmingDeleteRoom ? (
            <p className="rp-presets-note" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {roomUsageInfo && (roomUsageInfo.events > 0 || roomUsageInfo.reservations > 0)
                ? `Во оваа просторија има ${roomUsageInfo.events} ${roomUsageInfo.events === 1 ? "настан" : "настани"} и ${roomUsageInfo.reservations} ${roomUsageInfo.reservations === 1 ? "идна резервација" : "идни резервации"}. Со бришење се губат нивниот распоред, седењето и резервациите. Да се избрише?`
                : "Да се избрише просторијата?"}
              <button
                type="button"
                onClick={() => void handleDeleteRoom()}
                disabled={isDeletingRoom}
                className="btn btn-ghost"
                style={{ color: "var(--bad)" }}
              >
                {isDeletingRoom ? "Се брише..." : "Да, избриши"}
              </button>
              <button type="button" onClick={() => setConfirmingDeleteRoom(false)} disabled={isDeletingRoom} className="btn btn-ghost">
                Откажи
              </button>
            </p>
          ) : null}
          {deleteRoomError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{deleteRoomError}</p> : null}

          {!isManager ? null : !isUnlocked ? (
            <form onSubmit={handleUnlock} className="rp-presets">
              <div className="ev-field" style={{ flex: "0 1 260px" }}>
                <label className="lab-s" htmlFor="unlock-password">
                  Отклучи фиксен распоред (ѕидови, столбови, врати)
                </label>
                <input
                  id="unlock-password"
                  className="fld"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-gold">
                Отклучи
              </button>
            </form>
          ) : (
            <form onSubmit={handleSaveDimensions} className="rp-presets">
              <div className="ev-field" style={{ flex: "0 1 120px" }}>
                <label className="lab-s" htmlFor="room-width">
                  Ширина (м)
                </label>
                <input
                  id="room-width"
                  className="fld"
                  type="number"
                  min={1}
                  step={0.5}
                  value={widthM}
                  onChange={(e) => setWidthM(e.target.value)}
                />
              </div>
              <div className="ev-field" style={{ flex: "0 1 120px" }}>
                <label className="lab-s" htmlFor="room-height">
                  Длабочина (м)
                </label>
                <input
                  id="room-height"
                  className="fld"
                  type="number"
                  min={1}
                  step={0.5}
                  value={heightM}
                  onChange={(e) => setHeightM(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-gold">
                Зачувај големина
              </button>
            </form>
          )}
          {passwordError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{passwordError}</p> : null}
          {dimensionsError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{dimensionsError}</p> : null}
          {dimensionsSaved && !dimensionsError ? (
            <p role="status" style={{ color: "var(--ok)", fontSize: 13.5, margin: 0 }}>
              Големината е зачувана.
            </p>
          ) : null}
          {!isManager || !isUnlocked ? <p className="muted">Големина на просторијата: {widthCm / 100}м × {heightCm / 100}м</p> : null}

          <div className="rp-presets">
            <div className="ev-field" style={{ flex: "0 1 220px" }}>
              <label className="lab-s" htmlFor="preset-load">
                Зачувани планови
              </label>
              <select id="preset-load" className="fld" value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)}>
                <option value="">Избери план...</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn btn-gold" disabled={!selectedPresetId || presetBusy} onClick={() => void handleLoadPreset()}>
              Вчитај план
            </button>
            {isManager && isUnlocked ? (
              <form onSubmit={handleSavePreset} className="rp-presets-save">
                <div className="ev-field" style={{ flex: "0 1 220px" }}>
                  <label className="lab-s" htmlFor="preset-name">
                    Зачувај го тековниот распоред како план
                  </label>
                  <input id="preset-name" className="fld" value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="пр. Стандарден" />
                </div>
                <button type="submit" className="btn btn-gold" disabled={presetBusy}>
                  Зачувај план
                </button>
              </form>
            ) : null}
            {presetError ? <p className="rp-presets-note" style={{ color: "var(--bad)" }}>{presetError}</p> : null}
            {presetSaved && !presetError ? (
              <p role="status" className="rp-presets-note" style={{ color: "var(--ok)" }}>
                Планот е зачуван.
              </p>
            ) : null}
          </div>

          <div className="rp-palette">
            <p className="rp-palette-title">Додај елемент</p>
            <div className="rp-tile-grid">
              {isUnlocked ? (
                <>
                  <button type="button" className="rp-tile" onClick={() => handleAddFixed("wall")}>
                    <Icon name="minus" /> Ѕид
                  </button>
                  <button type="button" className="rp-tile" onClick={() => handleAddFixed("pillar")}>
                    <Icon name="box" /> Столб
                  </button>
                  <button type="button" className="rp-tile" onClick={() => handleAddFixed("door")}>
                    <Icon name="key" /> Врата
                  </button>
                  <button type="button" className="rp-tile" onClick={() => handleAddFixed("bar_fixed")}>
                    <Icon name="cutlery" /> Фиксен шанк
                  </button>
                  <button type="button" className="rp-tile" onClick={() => handleAddFixed("entrance")}>
                    <Icon name="right" /> Влез
                  </button>
                  <button type="button" className="rp-tile" onClick={() => handleAddFixed("wc")}>
                    <Icon name="occ" /> WC
                  </button>
                </>
              ) : null}
              <button type="button" className="rp-tile" onClick={() => handleAddMovable("stage")}>
                <Icon name="presentation" /> Бина
              </button>
              <button type="button" className="rp-tile" onClick={() => handleAddMovable("dance_floor")}>
                <Icon name="party" /> Танц подиум
              </button>
              <button type="button" className="rp-tile" onClick={() => handleAddMovable("bar_movable")}>
                <Icon name="cutlery" /> Шанк
              </button>
              <button type="button" className="rp-tile" onClick={() => handleAddMovable("music")}>
                <Icon name="mic" /> Музика
              </button>
              <button type="button" className="rp-tile" onClick={() => handleAddMovable("photo_stage")}>
                <Icon name="photo" /> Бина за сликање
              </button>
              <button type="button" className="rp-tile" disabled={!specialTableType} onClick={() => handleAddSpecialTable("couple")}>
                <Icon name="heart" /> Маса на младенците
              </button>
              <button type="button" className="rp-tile" disabled={!specialTableType} onClick={() => handleAddSpecialTable("head")}>
                <Icon name="users" /> Главна маса
              </button>
              <button type="button" className="rp-tile" disabled={!specialTableType} onClick={() => handleAddSpecialTable("crew")}>
                <Icon name="case" /> Маса за музика/фотографи
              </button>
              {tableTypes.map((tt) => (
                <div key={tt.id} className="rp-tile-wrap" ref={openTileMenuId === tt.id ? openTileMenuRef : undefined}>
                  <button
                    type="button"
                    className="rp-tile"
                    onClick={() => setOpenTileMenuId(openTileMenuId === tt.id ? null : tt.id)}
                  >
                    <Icon name="table" /> {tt.name} ({tablesPlacedForType(tt.id)}/{tt.quantity})
                  </button>
                  {openTileMenuId === tt.id ? (
                    <div className="rp-tile-menu" role="menu">
                      {confirmingDeleteTableTypeId === tt.id ? (
                        <>
                          <p className="rp-tile-menu-note">Да се избрише „{tt.name}“?</p>
                          <button
                            type="button"
                            role="menuitem"
                            className="rp-tile-menu-item"
                            style={{ color: "var(--bad)" }}
                            onClick={() => void handleDeleteTableType(tt.id)}
                          >
                            Да, избриши
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="rp-tile-menu-item"
                            onClick={() => setConfirmingDeleteTableTypeId(null)}
                          >
                            Откажи
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            className="rp-tile-menu-item"
                            disabled={tablesPlacedForType(tt.id) >= tt.quantity}
                            onClick={() => {
                              handleAddTable(tt);
                              setOpenTileMenuId(null);
                            }}
                          >
                            <Icon name="plus" size="sm" /> Користи во распоредот
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="rp-tile-menu-item"
                            onClick={() => {
                              setEditingTableTypeId(tt.id);
                              setOpenTileMenuId(null);
                            }}
                          >
                            <Icon name="edit" size="sm" /> Преименувај
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="rp-tile-menu-item"
                            style={{ color: "var(--bad)" }}
                            onClick={() => setConfirmingDeleteTableTypeId(tt.id)}
                          >
                            <Icon name="trash" size="sm" /> Избриши
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
              <button type="button" className="rp-tile" onClick={() => setShowAddTableType(true)}>
                <Icon name="plus" /> Друго
              </button>
            </div>
          </div>
          {actionError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{actionError}</p> : null}
          {deleteTableTypeError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{deleteTableTypeError}</p> : null}
        </div>

        <div className="rp-canvas-toolbar">
          <div role="group" aria-label="Историја">
            <button type="button" className="btn btn-ghost" onClick={() => void handleUndo()} disabled={!history.canUndo || isUndoing} title="Ctrl+Z">
              ← Назад
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void handleRedo()} disabled={!history.canRedo || isRedoing} title="Shift+Ctrl+Z">
              Напред →
            </button>
          </div>
          <div className="qb-zoom">
            <button
              type="button"
              className="sq"
              aria-label="Намали"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
            >
              <Icon name="minus" size="sm" />
            </button>
            <button type="button" className="rp-zoom-pct" aria-label="Ресетирај зум" onClick={() => setZoom(1)}>
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              className="sq"
              aria-label="Зголеми"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
            >
              <Icon name="plus" size="sm" />
            </button>
          </div>
          <button type="button" className="btn btn-ghost" onClick={toggleFullscreen}>
            <Icon name="expand" size="sm" /> {isFullscreen ? "Излез од цел екран" : "Цел екран"}
          </button>
          {historyError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{historyError}</p> : null}
        </div>

        <div ref={canvasWrapRef} className="qb-canvas-wrap rp-canvas-wrap">
          <CanvasCorner />
          <CanvasCorner flip />
          {isFullscreen ? (
            <div className="rp-fullscreen-toolbar">
              <div className="qb-zoom">
                <button
                  type="button"
                  className="sq"
                  aria-label="Намали"
                  onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
                >
                  <Icon name="minus" size="sm" />
                </button>
                <button type="button" className="rp-zoom-pct" aria-label="Ресетирај зум" onClick={() => setZoom(1)}>
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="sq"
                  aria-label="Зголеми"
                  onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
                >
                  <Icon name="plus" size="sm" />
                </button>
              </div>
              <button type="button" className="btn btn-ghost" onClick={toggleFullscreen}>
                <Icon name="x" size="sm" /> Излез од цел екран
              </button>
            </div>
          ) : null}
          <div className="qb-canvas-zoom" style={{ transform: `scale(${zoom})` }}>
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
              watermarkUrl={logoUrl}
            />
          </div>
        </div>
      </section>

      {showAddTableType ? (
        <Modal title="Додај" onClose={() => setShowAddTableType(false)} hideHeader>
          <div className="modal-head">
            <h2>Додај</h2>
            <button type="button" className="modal-close" onClick={() => setShowAddTableType(false)} aria-label="Затвори">
              <Icon name="x" size="sm" />
            </button>
          </div>
          <div className="ev-calc-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={addMode === "table"} className={`ev-calc-tab${addMode === "table" ? " on" : ""}`} onClick={() => setAddMode("table")}>
              Нов вид маса
            </button>
            <button type="button" role="tab" aria-selected={addMode === "decoration"} className={`ev-calc-tab${addMode === "decoration" ? " on" : ""}`} onClick={() => setAddMode("decoration")}>
              Декорација (без столчиња)
            </button>
          </div>
          {addMode === "table" ? (
            <TableTypeForm
              roomId={room.id}
              onSaved={async () => {
                setTableTypes(await listTableTypes(room.id));
                setShowAddTableType(false);
              }}
              onCancel={() => setShowAddTableType(false)}
            />
          ) : (
            <DecorationForm onAdd={handleAddDecoration} onCancel={() => setShowAddTableType(false)} />
          )}
        </Modal>
      ) : null}

      {editingTableTypeId ? (
        <Modal
          title={`Преименувај ${tableTypes.find((t) => t.id === editingTableTypeId)?.name ?? ""}`}
          onClose={() => setEditingTableTypeId(null)}
        >
          <TableTypeForm
            roomId={room.id}
            editingType={tableTypes.find((t) => t.id === editingTableTypeId)!}
            onSaved={handleTableTypeEdited}
            onCancel={() => setEditingTableTypeId(null)}
          />
        </Modal>
      ) : null}
    </div>
  );
}
