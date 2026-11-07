"use client";

import { useEffect, useMemo, useState } from "react";
import { FloorPlanCanvas, type CanvasElement } from "./FloorPlanCanvas";
import {
  listFixedElements,
  listRoomLayoutElements,
  numberTables,
  FIXED_TYPE_COLORS,
  type FixedElement,
  type RoomLayoutElement,
} from "@/lib/venue/floorplan";
import { getRoomById, listTableTypes, type Room, type TableType } from "@/lib/venue/rooms";
import { getTableAvailability, getReservationForEvent, updateReservationTables, type Reservation } from "@/lib/venue/reservations";
import { errorMessage } from "@/lib/venue/user-error";
import { getVenueLogoUrl } from "@/lib/venue/venue-profile";

const LOAD_ERROR = "Податоците не можеа да се вчитаат.";

/**
 * Project B §3: the only place a mini-event's tables are ever touched — a
 * mini-event gets no seating editor at all (no draft, no baseline), just
 * this room's floor plan, reusing the exact table-picker, availability
 * coloring and conflict check Резервации already has. Always staff-
 * assisted, matching the standing decision this never becomes self-service.
 */
export function MiniEventTablesTab({ eventId }: { eventId: string }) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [fixedElements, setFixedElements] = useState<FixedElement[]>([]);
  const [layoutElements, setLayoutElements] = useState<RoomLayoutElement[]>([]);
  const [tableTypes, setTableTypes] = useState<TableType[]>([]);
  const [reservedTableIds, setReservedTableIds] = useState<string[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const failedToLoad = () => setLoadError(LOAD_ERROR);

  useEffect(() => {
    let cancelled = false;
    getReservationForEvent(eventId)
      .then(async (res) => {
        if (cancelled || !res) return;
        setReservation(res);
        setSelectedTableIds(res.table_ids);
        const [roomRow, fixed, layout, types, logo] = await Promise.all([
          getRoomById(res.room_id),
          listFixedElements(res.room_id),
          listRoomLayoutElements(res.room_id),
          listTableTypes(res.room_id),
          getVenueLogoUrl(res.venue_id),
        ]);
        if (cancelled) return;
        setRoom(roomRow);
        setFixedElements(fixed);
        setLayoutElements(layout);
        setTableTypes(types);
        setLogoUrl(logo);
      })
      .catch(() => {
        if (!cancelled) failedToLoad();
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    if (!reservation) return;
    const allTableIds = layoutElements.filter((el) => el.element_type === "table").map((el) => el.id);
    if (allTableIds.length === 0) {
      setReservedTableIds([]);
      return;
    }
    let cancelled = false;
    getTableAvailability(reservation.room_id, reservation.date, reservation.start_time, allTableIds, reservation.id)
      .then(({ reserved }) => {
        if (!cancelled) setReservedTableIds(reserved);
      })
      .catch(() => {
        if (!cancelled) failedToLoad();
      });
    return () => {
      cancelled = true;
    };
  }, [reservation, layoutElements]);

  function toggleTable(id: string) {
    setSaveStatus(null);
    setSelectedTableIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
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
      label: el.label ?? el.element_type,
      shape: "rect" as const,
      locked: true,
    })),
    ...layoutElements.map((el) => {
      const isTable = el.element_type === "table";
      const tableType = el.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : null;
      const shape: "rect" | "circle" = isTable && tableType?.shape === "round" ? "circle" : "rect";
      const selected = selectedTableIds.includes(el.id);
      const reserved = isTable && reservedTableIds.includes(el.id);
      const color = !isTable ? "#737373" : selected ? "#F59E0B" : reserved ? "#DC2626" : "#16A34A";
      const tableNumber = tableNumbers.get(el.id);
      const label =
        isTable && tableNumber != null
          ? tableType
            ? `${tableNumber} (${tableType.seats})`
            : String(tableNumber)
          : (el.label ?? tableType?.name ?? el.element_type);
      return {
        id: el.id,
        x_cm: el.x_cm,
        y_cm: el.y_cm,
        width_cm: el.width_cm,
        height_cm: el.length_cm,
        color,
        label,
        shape,
        locked: !isTable,
        seatCount: isTable ? tableType?.seats : undefined,
      };
    }),
  ];

  const selectedCapacity = selectedTableIds.reduce((sum, id) => {
    const el = layoutElements.find((l) => l.id === id);
    const tableType = el?.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : null;
    return sum + (tableType?.seats ?? 0);
  }, 0);

  async function handleSave() {
    if (!reservation) return;
    setSaveError(null);
    setSaveStatus(null);
    setIsSaving(true);
    try {
      const updated = await updateReservationTables(
        reservation.id,
        reservation.room_id,
        reservation.date,
        reservation.start_time,
        reservation.end_time,
        selectedTableIds,
      );
      setReservation(updated);
      setSaveStatus("Зачувано.");
    } catch (err) {
      setSaveError(errorMessage(err, "Не успеа зачувувањето на масите. Обидете се повторно."));
    } finally {
      setIsSaving(false);
    }
  }

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!reservation || !room) return <p className="ev-hint">Се вчитува...</p>;

  return (
    <div>
      <p className="ev-hint" style={{ marginBottom: 10 }}>
        Изберете колку маси и кои точно му треба на настанот. Гостите може да се сменат во секое време — вратете се
        овде за да додадете или отстраните маси.
      </p>
      <p className="lab-s" style={{ marginBottom: 10 }}>
        {selectedTableIds.length} маси · {selectedCapacity} седишта
      </p>
      <FloorPlanCanvas
        widthCm={room.width_cm}
        heightCm={room.height_cm}
        elements={canvasElements}
        selectedElementId={null}
        onSelect={() => {}}
        onMoveEnd={() => {}}
        onResizeEnd={() => {}}
        onRotateEnd={() => {}}
        onDelete={() => {}}
        mode="select"
        selectedIds={selectedTableIds}
        onToggleSelect={toggleTable}
        watermarkUrl={logoUrl}
      />
      <div className="qb-legend" style={{ marginTop: 10 }}>
        <span><i style={{ background: "#16A34A" }} /> Слободна</span>
        <span><i style={{ background: "#DC2626" }} /> Резервирана</span>
        <span><i style={{ background: "#F59E0B" }} /> Избрана</span>
      </div>
      {saveError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: "8px 0 0" }}>{saveError}</p> : null}
      {saveStatus ? <p className="muted" style={{ margin: "8px 0 0" }}>{saveStatus}</p> : null}
      <button type="button" className="btn btn-gold" style={{ marginTop: 10 }} onClick={handleSave} disabled={isSaving}>
        {isSaving ? "Се зачувува..." : "Зачувај маси"}
      </button>
    </div>
  );
}
