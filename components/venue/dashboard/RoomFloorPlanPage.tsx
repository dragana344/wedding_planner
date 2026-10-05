"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/venue/shell/Icon";
import { FloorPlanCanvas, type CanvasElement } from "./FloorPlanCanvas";
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
  type TableRole,
  type FixedElement,
  type FixedElementType,
  type RoomLayoutElement,
  type LayoutElementType,
} from "@/lib/venue/floorplan";
import { type Room, type TableType } from "@/lib/venue/rooms";
import { errorMessage } from "@/lib/venue/user-error";
import { openSpot } from "@/lib/venue/open-spot";

export function RoomFloorPlanPage({
  venueId,
  room,
  initialFixedElements,
  initialLayoutElements,
  initialTableTypes,
}: {
  venueId: string;
  room: Room;
  initialFixedElements: FixedElement[];
  initialLayoutElements: RoomLayoutElement[];
  initialTableTypes: TableType[];
}) {
  const [fixedElements, setFixedElements] = useState(initialFixedElements);
  const [layoutElements, setLayoutElements] = useState(initialLayoutElements);
  const [tableTypes] = useState(initialTableTypes);
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

  async function refresh() {
    setFixedElements(await listFixedElements(room.id));
    setLayoutElements(await listRoomLayoutElements(room.id));
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

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
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
      const created = await addFixedElement({
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
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа додавањето на елементот. Обидете се повторно."));
    }
  }

  async function handleAddMovable(type: LayoutElementType) {
    setActionError(null);
    try {
      const created = await addRoomLayoutElement({
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
      });
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
      const created = await addRoomLayoutElement({
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
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа додавањето на масата. Обидете се повторно."));
    }
  }

  async function handleAddTable(tableType: TableType) {
    setActionError(null);
    if (tablesPlacedForType(tableType.id) >= tableType.quantity) {
      setActionError(`Сите маси од видот „${tableType.name}“ се веќе поставени.`);
      return;
    }
    try {
      const created = await addRoomLayoutElement({
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
      });
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
        if (!isUnlocked) return;
        await updateFixedElementPosition(id, xCm, yCm);
      } else {
        await updateRoomLayoutElementPosition(id, xCm, yCm);
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
        if (!isUnlocked) return;
        await updateFixedElementSize(id, w, h);
      } else {
        await updateRoomLayoutElementSize(id, w, h);
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
        if (!isUnlocked) return;
        await deleteFixedElement(id);
      } else {
        await deleteRoomLayoutElement(id);
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
        if (!isUnlocked) return;
        await updateFixedElementRotation(id, rotationDeg);
      } else {
        await updateRoomLayoutElementRotation(id, rotationDeg);
      }
      await refresh();
    } catch (err) {
      setActionError(errorMessage(err, "Не успеа ротирањето на елементот. Обидете се повторно."));
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
        el.element_type === "table" ? (tableType?.shape === "rectangular" ? "rect" : "circle") : "rect";
      const tableNumber = tableNumbers.get(el.id);
      const role = el.table_role ?? "guest";
      const label =
        el.element_type === "table" && role !== "guest"
          ? (el.label ?? TABLE_ROLE_LABELS[role])
          : el.element_type === "table" && tableNumber != null
          ? tableType
            ? `${tableNumber} (${tableType.seats})`
            : String(tableNumber)
          : (el.label ?? MOVABLE_LABELS[el.element_type]);
      return {
        id: el.id,
        x_cm: el.x_cm,
        y_cm: el.y_cm,
        width_cm: el.width_cm,
        height_cm: el.length_cm,
        color: el.element_type === "table" && role === "couple" ? COUPLE_TABLE_COLOR : MOVABLE_TYPE_COLORS[el.element_type],
        label,
        shape,
        rotationDeg: el.rotation_deg,
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

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">{room.name} — распоред на маси</h2>
          {isUnlocked ? (
            <button type="button" className="btn btn-ghost" onClick={() => setIsUnlocked(false)}>
              Заклучи
            </button>
          ) : null}
        </div>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {!isUnlocked ? (
            <form onSubmit={handleUnlock} style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
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
            <form onSubmit={handleSaveDimensions} style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
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
          {!isUnlocked ? <p className="muted">Големина на просторијата: {widthCm / 100}м × {heightCm / 100}м</p> : null}

          <div className="chip-row">
            {isUnlocked ? (
              <>
                <button type="button" className="chip" onClick={() => handleAddFixed("wall")}>
                  + Ѕид
                </button>
                <button type="button" className="chip" onClick={() => handleAddFixed("pillar")}>
                  + Столб
                </button>
                <button type="button" className="chip" onClick={() => handleAddFixed("door")}>
                  + Врата
                </button>
                <button type="button" className="chip" onClick={() => handleAddFixed("bar_fixed")}>
                  + Фиксен шанк
                </button>
                <button type="button" className="chip" onClick={() => handleAddFixed("entrance")}>
                  + Влез
                </button>
                <button type="button" className="chip" onClick={() => handleAddFixed("wc")}>
                  + WC
                </button>
              </>
            ) : null}
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
          {actionError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{actionError}</p> : null}
        </div>

        <div className="qb-canvas-wrap">
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
          />
        </div>
      </section>
    </div>
  );
}
