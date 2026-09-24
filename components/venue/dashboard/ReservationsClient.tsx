"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import { FloorPlanCanvas, type CanvasElement } from "./FloorPlanCanvas";
import {
  listFixedElements,
  listRoomLayoutElements,
  numberTables,
  FIXED_TYPE_COLORS,
  type FixedElement,
  type RoomLayoutElement,
} from "@/lib/venue/floorplan";
import { listTableTypes, type RoomWithSeatTotal, type TableType } from "@/lib/venue/rooms";
import {
  getTableAvailability,
  createReservation,
  listReservationsForDate,
  updateReservationStatus,
  deleteReservation,
  RESERVATION_STATUS_META,
  type Reservation,
  type ReservationStatus,
} from "@/lib/venue/reservations";

const TIME_PRESETS = ["11:00", "15:00", "17:00", "20:00", "22:00"];
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.4;
const ZOOM_STEP = 0.15;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDaysIso(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return todayIsoFrom(d);
}
function todayIsoFrom(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function ReservationsClient({
  venueId,
  initialReservations,
  rooms,
}: {
  venueId: string;
  initialReservations: Reservation[];
  rooms: RoomWithSeatTotal[];
}) {
  // ---- overall stats (venue-wide, independent of the day being viewed) ----
  const [reservations, setReservations] = useState(initialReservations);
  const counts = useMemo(
    () => ({
      total: reservations.length,
      reserved: reservations.filter((r) => r.status === "reserved").length,
      seated: reservations.filter((r) => r.status === "seated").length,
    }),
    [reservations]
  );

  // ---- new-reservation form: date/time/guests/room drive both the floor
  // plan below AND which day's list shows at the bottom of the page ----
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState(TIME_PRESETS[0]);
  const [endTime, setEndTime] = useState("");
  const [partySize, setPartySize] = useState(2);

  const [fixedElements, setFixedElements] = useState<FixedElement[]>([]);
  const [layoutElements, setLayoutElements] = useState<RoomLayoutElement[]>([]);
  const [tableTypes, setTableTypes] = useState<TableType[]>([]);
  const [reservedTableIds, setReservedTableIds] = useState<string[]>([]);
  const [limitedTableIds, setLimitedTableIds] = useState<string[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [zoom, setZoom] = useState(1);

  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const room = rooms.find((r) => r.id === roomId);

  useEffect(() => {
    if (!roomId) return;
    setSelectedTableIds([]);
    (async () => {
      const [fixed, layout, types] = await Promise.all([
        listFixedElements(roomId),
        listRoomLayoutElements(roomId),
        listTableTypes(roomId),
      ]);
      setFixedElements(fixed);
      setLayoutElements(layout);
      setTableTypes(types);
    })();
  }, [roomId, refreshTick]);

  // Purely advisory floor-plan coloring — red ("reserved") within an hour of
  // an upcoming booking or genuinely occupied right now, yellow ("limited")
  // within the default 3h booking window but not yet imminent. This never
  // gates submission: createReservation always runs its own accurate
  // conflict check server-side regardless of what's shown here.
  useEffect(() => {
    if (!roomId || !date || !startTime) {
      setReservedTableIds([]);
      setLimitedTableIds([]);
      return;
    }
    const allTableIds = layoutElements.filter((el) => el.element_type === "table").map((el) => el.id);
    if (allTableIds.length === 0) {
      setReservedTableIds([]);
      setLimitedTableIds([]);
      return;
    }
    getTableAvailability(roomId, date, startTime, allTableIds, null).then(({ reserved, limited }) => {
      setReservedTableIds(reserved);
      setLimitedTableIds(limited);
    });
  }, [roomId, date, startTime, layoutElements, isSubmitting]);

  function toggleTable(id: string) {
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
      const limited = isTable && limitedTableIds.includes(el.id);
      const color = !isTable
        ? "#737373"
        : selected
          ? "#F59E0B"
          : reserved
            ? "#DC2626"
            : limited
              ? "#EAB308"
              : "#16A34A";
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
      };
    }),
  ];

  const selectedTables = useMemo(
    () =>
      selectedTableIds.map((id) => {
        const el = layoutElements.find((l) => l.id === id);
        const tableType = el?.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : null;
        const number = tableNumbers.get(id);
        return { id, label: number != null ? `Маса ${number}` : (el?.label ?? tableType?.name ?? "Маса"), seats: tableType?.seats ?? 0 };
      }),
    [selectedTableIds, layoutElements, tableTypes, tableNumbers]
  );
  const selectedCapacity = selectedTables.reduce((sum, t) => sum + t.seats, 0);

  // ---- day list: every reservation on the selected date, across all rooms
  // (independently filterable), with seat/free/cancel actions ----
  const [dayReservations, setDayReservations] = useState<Reservation[]>([]);
  const [listRoomFilter, setListRoomFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!date) {
      setDayReservations([]);
      return;
    }
    listReservationsForDate(venueId, date).then(setDayReservations);
  }, [venueId, date, isSubmitting]);

  const filteredDayReservations = dayReservations.filter((r) => {
    if (listRoomFilter !== "all" && r.room_id !== listRoomFilter) return false;
    if (search && !r.guest_name.toLowerCase().includes(search.toLowerCase()) && !r.phone.includes(search)) return false;
    return true;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selectedTableIds.length === 0) {
      setError("Изберете барем една маса.");
      return;
    }
    setIsSubmitting(true);
    try {
      const created = await createReservation({
        venue_id: venueId,
        room_id: roomId,
        guest_name: guestName,
        phone,
        email: email || null,
        date,
        start_time: startTime,
        end_time: endTime || null,
        party_size: partySize,
        note: note || null,
        table_ids: selectedTableIds,
      });
      setReservations((prev) => [...prev, created]);
      setDayReservations((prev) => [...prev, created]);
      setGuestName("");
      setPhone("");
      setEmail("");
      setNote("");
      setSelectedTableIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create reservation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel(id: string) {
    await deleteReservation(id);
    setReservations((prev) => prev.filter((r) => r.id !== id));
    setDayReservations((prev) => prev.filter((r) => r.id !== id));
  }

  // reserved -> seated is a real status change (table now occupied).
  // seated -> "guests left" deletes the reservation outright: once the
  // table is freed, there's no resting "completed" record to keep around.
  async function handleToggleOccupied(id: string, currentStatus: ReservationStatus) {
    if (currentStatus === "reserved") {
      await updateReservationStatus(id, "seated");
      setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status: "seated" } : r)));
      setDayReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status: "seated" } : r)));
    } else {
      await deleteReservation(id);
      setReservations((prev) => prev.filter((r) => r.id !== id));
      setDayReservations((prev) => prev.filter((r) => r.id !== id));
    }
  }

  return (
    <div className="wrap">
      <section className="tiles" aria-label="Преглед">
        <div className="tile">
          <span className="badge"><Icon name="book" size="lg" /></span>
          <div>
            <div className="num">{counts.total}</div>
            <div className="lab">Вкупно резервации</div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="clock" size="lg" /></span>
          <div>
            <div className="num">{counts.reserved}</div>
            <div className="lab">Резервирани</div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="users" size="lg" /></span>
          <div>
            <div className="num">{counts.seated}</div>
            <div className="lab">Зафатени</div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">
            <Icon name="plus" size="sm" /> Нова резервација
          </h2>
        </div>
        <div className="qb-toolbar">
          <div className="qb-field">
            <label className="lab-s">Датум</label>
            <input type="date" className="fld" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="qb-field qb-field-time">
            <label className="lab-s">Термин</label>
            <div className="qb-time-row">
              <div className="seg">
                {TIME_PRESETS.map((t) => (
                  <button key={t} type="button" aria-pressed={startTime === t} onClick={() => setStartTime(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <input
                type="time"
                className="fld qb-time-exact"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                aria-label="Точно време"
              />
            </div>
          </div>
          <div className="qb-field">
            <label className="lab-s">До (опционално)</label>
            <input
              type="time"
              className="fld"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              aria-label="До кое време"
            />
          </div>
          <div className="qb-field qb-field-narrow">
            <label className="lab-s">Гости</label>
            <input
              type="number"
              className="fld"
              min={1}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
            />
          </div>
          <div className="qb-field qb-field-grow">
            <label className="lab-s">Сала</label>
            <div className="seg">
              {rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={roomId === r.id}
                  aria-label={`Изберете сала: ${r.name}`}
                  onClick={() => setRoomId(r.id)}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="qb-layout">
        <section className="panel">
          <div className="panel-h">
            <h2 className="panel-t">
              <Icon name="tables" size="sm" /> Распоред на маси {room ? `— ${room.name}` : ""}
            </h2>
            <div className="qb-floor-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setRefreshTick((n) => n + 1)}>
                <Icon name="refresh" size="sm" /> Освежи приказ
              </button>
              <div className="qb-zoom">
                <button
                  type="button"
                  className="sq"
                  aria-label="Намали"
                  onClick={() => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)))}
                >
                  <Icon name="minus" size="sm" />
                </button>
                <button
                  type="button"
                  className="sq"
                  aria-label="Зголеми"
                  onClick={() => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)))}
                >
                  <Icon name="plus" size="sm" />
                </button>
                <button type="button" className="sq" aria-label="Ресетирај зум" onClick={() => setZoom(1)}>
                  <Icon name="expand" size="sm" />
                </button>
              </div>
            </div>
          </div>

          <div className="qb-canvas-wrap">
            <div className="qb-canvas-zoom" style={{ transform: `scale(${zoom})` }}>
              {room ? (
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
                />
              ) : null}
            </div>
          </div>

          <div className="qb-legend">
            <span><i style={{ background: "#16A34A" }} /> Слободна</span>
            <span><i style={{ background: "#EAB308" }} /> Ограничено (наскоро зафатена)</span>
            <span><i style={{ background: "#DC2626" }} /> Резервирана</span>
            <span><i style={{ background: "#F59E0B" }} /> Избрана</span>
          </div>

          {selectedTables.length > 0 ? (
            <div className="foot">
              <span className="count">
                Избрани маси: <b>{selectedTables.map((t) => t.label).join(", ")}</b> ({selectedCapacity} места)
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => setSelectedTableIds([])}>
                Одгрупирај маси
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel qb-side">
          <div className="panel-h">
            <h2 className="panel-t">
              <Icon name="table" size="sm" /> Избрани маси
            </h2>
            <span className="count">Вкупно места: {selectedCapacity}</span>
          </div>
          <div style={{ padding: "12px 16px" }}>
            {selectedTables.length === 0 ? (
              <p className="muted">Кликнете на слободна маса за да ја изберете.</p>
            ) : (
              <div className="qb-selected-list">
                {selectedTables.map((t) => (
                  <div className="qb-selected-row" key={t.id}>
                    <Icon name="table" size="sm" />
                    <span>
                      <b>{t.label}</b>
                      <span>Капацитет: {t.seats} места</span>
                    </span>
                    <button type="button" onClick={() => toggleTable(t.id)} aria-label="Отстрани">
                      <Icon name="x" size="sm" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="muted" style={{ marginTop: 8 }}>
              Бараш: {partySize} гости {selectedCapacity > 0 ? `· избрано ${selectedCapacity}` : ""}
            </p>

            <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
              <p className="lab-s">Детали за резервација</p>
              <div style={{ marginBottom: 10 }}>
                <label className="lab-s">Име и презиме</label>
                <input className="fld" placeholder="Име и презиме" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label className="lab-s">Телефон</label>
                <input className="fld" placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label className="lab-s">Е-пошта (незадолжително)</label>
                <input className="fld" placeholder="Е-пошта" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label className="lab-s">Белешка (опционално)</label>
                <input className="fld" placeholder="Белешка" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {error ? <p style={{ color: "var(--bad)" }}>{error}</p> : null}
              <button type="submit" className="btn btn-gold" disabled={isSubmitting} style={{ width: "100%", justifyContent: "center" }}>
                {isSubmitting ? "Резервирање..." : "Резервирај маса(и)"}
              </button>
            </form>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">
            <Icon name="book" size="sm" /> Резервации за {date}
          </h2>
          <div className="qb-day-nav">
            <button type="button" className="sq" aria-label="Претходен ден" onClick={() => setDate((d) => addDaysIso(d, -1))}>
              <Icon name="left" size="sm" />
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setDate(todayIso())}>
              Денес
            </button>
            <button type="button" className="sq" aria-label="Следен ден" onClick={() => setDate((d) => addDaysIso(d, 1))}>
              <Icon name="right" size="sm" />
            </button>
          </div>
          <div className="seg">
            <button type="button" aria-pressed={listRoomFilter === "all"} onClick={() => setListRoomFilter("all")}>
              Сите простории
            </button>
            {rooms.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={listRoomFilter === r.id}
                aria-label={`Прикажи резервации за: ${r.name}`}
                onClick={() => setListRoomFilter(r.id)}
              >
                {r.name}
              </button>
            ))}
          </div>
          <input
            className="fld"
            placeholder="Пребарај по име или телефон"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="count">{filteredDayReservations.length} резервации</span>
        </div>

        {filteredDayReservations.length === 0 ? (
          <div className="empty" style={{ padding: "24px 20px" }}>
            <b>Нема резервации</b>
            Нема резервации за {date} што одговараат на филтрите.
          </div>
        ) : (
          <div className="qb-slot-table">
            <div className="qb-slot-row qb-slot-head">
              <span>Време</span>
              <span>Име на клиент</span>
              <span>Телефон</span>
              <span>Сала</span>
              <span>Гости</span>
              <span>Статус</span>
              <span></span>
            </div>
            {filteredDayReservations.map((r) => {
              const status = RESERVATION_STATUS_META[r.status];
              const roomForRow = rooms.find((room) => room.id === r.room_id);
              return (
                <div className="qb-slot-row" key={r.id}>
                  <span>{r.start_time.slice(0, 5)}</span>
                  <span><b>{r.guest_name}</b></span>
                  <span>{r.phone}</span>
                  <span>{roomForRow?.name ?? "—"}</span>
                  <span>{r.party_size}</span>
                  <span className={`pill ${status.pill}`}>{status.label}</span>
                  <span style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" className="btn btn-ghost" onClick={() => handleToggleOccupied(r.id, r.status)}>
                      {r.status === "reserved" ? "Зафатена" : "Слободна"}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => handleCancel(r.id)}>
                      Откажи
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
