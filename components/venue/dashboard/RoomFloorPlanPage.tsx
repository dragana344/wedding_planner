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
  type FixedElement,
  type FixedElementType,
  type RoomLayoutElement,
  type LayoutElementType,
} from "@/lib/venue/floorplan";
import { type Room, type TableType } from "@/lib/venue/rooms";

const FIXED_LABELS: Record<FixedElementType, string> = {
  wall: "Ѕид",
  pillar: "Столб",
  door: "Врата",
  bar_fixed: "Фиксен шанк",
  other: "Друго",
};

const MOVABLE_LABELS: Record<LayoutElementType, string> = {
  table: "Маса",
  stage: "Бина",
  dance_floor: "Плоштад за танцување",
  bar_movable: "Movable bar",
  other: "Друго",
};

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
      setPasswordError("Погрешна лозинка.");
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
        x_cm: Math.max(0, (widthCm - 100) / 2),
        y_cm: Math.max(0, (heightCm - 20) / 2),
        width_cm: 100,
        height_cm: 20,
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не успеа додавањето на елементот. Обидете се повторно.");
    }
  }

  async function handleAddMovable(type: LayoutElementType) {
    setActionError(null);
    try {
      const created = await addRoomLayoutElement({
        room_id: room.id,
        element_type: type,
        x_cm: Math.max(0, (widthCm - 200) / 2),
        y_cm: Math.max(0, (heightCm - 150) / 2),
        width_cm: 200,
        length_cm: 150,
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не успеа додавањето на елементот. Обидете се повторно.");
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
        x_cm: Math.max(0, (widthCm - tableType.width_cm) / 2),
        y_cm: Math.max(0, (heightCm - tableType.length_cm) / 2),
        width_cm: tableType.width_cm,
        length_cm: tableType.length_cm,
        label: tableType.name,
      });
      await refresh();
      setSelectedId(created.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не успеа додавањето на масата. Обидете се повторно.");
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
      setActionError(err instanceof Error ? err.message : "Не успеа поместувањето на елементот. Обидете се повторно.");
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
      setActionError(err instanceof Error ? err.message : "Не успеа менувањето на големината. Обидете се повторно.");
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
      setActionError(err instanceof Error ? err.message : "Не успеа бришењето на елементот. Обидете се повторно.");
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
      setActionError(err instanceof Error ? err.message : "Не успеа ротирањето на елементот. Обидете се повторно.");
    }
  }

  async function handleSaveDimensions(e: React.FormEvent) {
    e.preventDefault();
    setDimensionsError(null);
    const nextWidthCm = Number(widthM) * 100;
    const nextHeightCm = Number(heightM) * 100;
    if (!Number.isFinite(nextWidthCm) || nextWidthCm <= 0 || !Number.isFinite(nextHeightCm) || nextHeightCm <= 0) {
      setDimensionsError("Внесете важечка ширина и длабочина.");
      return;
    }
    await updateRoomDimensions(room.id, nextWidthCm, nextHeightCm);
    setWidthCm(nextWidthCm);
    setHeightCm(nextHeightCm);
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
      const label =
        el.element_type === "table" && tableNumber != null
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
        color: MOVABLE_TYPE_COLORS[el.element_type],
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
              </>
            ) : null}
            <button type="button" className="chip" onClick={() => handleAddMovable("stage")}>
              + Бина
            </button>
            <button type="button" className="chip" onClick={() => handleAddMovable("dance_floor")}>
              + Плоштад за танцување
            </button>
            <button type="button" className="chip" onClick={() => handleAddMovable("bar_movable")}>
              + Movable bar
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
