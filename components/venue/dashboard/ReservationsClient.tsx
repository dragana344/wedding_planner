"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import { FloorPlanCanvas, PX_PER_CM, type CanvasElement } from "./FloorPlanCanvas";
import { fitZoom } from "@/lib/seating/zoom-to-fit";
import { HourOccupancySlider } from "./HourOccupancySlider";
import { computeHourlyTableOccupancy } from "@/lib/venue/occupancy";
import { formatVenueDatePadded } from "@/lib/date";
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
  listReservationsForRoom,
  updateReservationStatus,
  deleteReservation,
  RESERVATION_STATUS_META,
  type Reservation,
  type ReservationStatus,
} from "@/lib/venue/reservations";
import { errorMessage } from "@/lib/venue/user-error";
import { deleteEventViaApi } from "@/lib/venue/events-client";
import { hasFullEventOnDate } from "@/lib/venue/events";
import { getVenueLogoUrl } from "@/lib/venue/venue-profile";
import { useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";

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

const LOAD_ERROR = "Податоците за резервациите не можеа да се вчитаат.";

export function ReservationsClient({
  venueId,
  initialReservations,
  rooms,
}: {
  venueId: string;
  initialReservations: Reservation[];
  rooms: RoomWithSeatTotal[];
}) {
  const { token: managerToken } = useManagerElevation();

  // Project C: the venue's own logo, watermarked over the floor plan.
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    getVenueLogoUrl(venueId)
      .then(setLogoUrl)
      .catch(() => {});
  }, [venueId]);

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
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [zoom, setZoom] = useState(1);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  // Project C: a wide room starts zoomed to fit the visible width, once per
  // room — not a live resize behaviour; the manual +/- buttons still work from there.
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const roomWidthCm = rooms.find((r) => r.id === roomId)?.width_cm ?? 0;
    setZoom(fitZoom(roomWidthCm, PX_PER_CM, el.clientWidth, ZOOM_MIN));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [serverName, setServerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverNameMissing, setServerNameMissing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // A failed background load (floor plan, availability, the day's list) is
  // said out loud instead of leaving stale or empty data on screen.
  const [loadError, setLoadError] = useState<string | null>(null);
  const failedToLoad = () => setLoadError(LOAD_ERROR);

  const room = rooms.find((r) => r.id === roomId);

  // Picking another hall starts a fresh table selection; "Освежи приказ"
  // (refreshTick) only reloads, keeping what was already picked.
  useEffect(() => {
    setSelectedTableIds([]);
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setLoadError(null);
    Promise.all([listFixedElements(roomId), listRoomLayoutElements(roomId), listTableTypes(roomId)])
      .then(([fixed, layout, types]) => {
        if (cancelled) return;
        setFixedElements(fixed);
        setLayoutElements(layout);
        setTableTypes(types);
      })
      .catch(() => {
        if (!cancelled) failedToLoad();
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, refreshTick]);

  // Hour-occupancy slider: previewTime is what actually drives the floor
  // plan's colors below, so scrubbing the slider can preview any hour
  // without touching the reservation form's own start time. It stays in
  // sync with startTime until the slider is dragged away from it.
  const [previewTime, setPreviewTime] = useState(startTime);
  useEffect(() => {
    setPreviewTime(startTime);
  }, [startTime]);
  const activeHour = Number(previewTime.split(":")[0]);
  function handleHourChange(hour: number) {
    setPreviewTime(`${String(hour).padStart(2, "0")}:00`);
  }

  // Purely advisory floor-plan coloring — red ("reserved") only for a table
  // genuinely occupied right at the previewed instant, no advance-warning
  // lead time. This never gates submission: createReservation always runs
  // its own accurate conflict check server-side regardless of what's shown
  // here.
  useEffect(() => {
    if (!roomId || !date || !previewTime) {
      setReservedTableIds([]);
      return;
    }
    const allTableIds = layoutElements.filter((el) => el.element_type === "table").map((el) => el.id);
    if (allTableIds.length === 0) {
      setReservedTableIds([]);
      return;
    }
    // Responses can arrive out of order when the hour or day changes
    // quickly: only the latest request may update the colors.
    let cancelled = false;
    getTableAvailability(roomId, date, previewTime, allTableIds, null)
      .then(({ reserved }) => {
        if (cancelled) return;
        setReservedTableIds(reserved);
      })
      .catch(() => {
        if (!cancelled) failedToLoad();
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, date, previewTime, layoutElements, isSubmitting, refreshTick]);

  // Hour-by-hour occupancy for the whole day, feeding the slider above the
  // floor plan — independent of previewTime, since the slider needs every
  // hour's percentage at once, not just the currently previewed one.
  const [roomDayReservations, setRoomDayReservations] = useState<Reservation[]>([]);
  useEffect(() => {
    if (!roomId || !date) {
      setRoomDayReservations([]);
      return;
    }
    let cancelled = false;
    listReservationsForRoom(roomId, date)
      .then((list) => {
        if (!cancelled) setRoomDayReservations(list);
      })
      .catch(() => {
        if (!cancelled) failedToLoad();
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, date, isSubmitting, refreshTick]);

  const totalTables = useMemo(
    () => layoutElements.filter((el) => el.element_type === "table").length,
    [layoutElements]
  );
  const hourlyOccupancy = useMemo(
    () => computeHourlyTableOccupancy(roomDayReservations, totalTables),
    [roomDayReservations, totalTables]
  );
  // Project B §4: a plain number for staff to look at before taking another
  // booking — never a gate. The busiest hour across the day is "how full it
  // gets", the same reservations the slider above already reflects (mini-
  // events included, since their table claim is a reservation too).
  const busiestHourReserved = useMemo(() => Math.max(0, ...hourlyOccupancy.map((h) => h.reservedTables)), [hourlyOccupancy]);

  // Project B §5: purely informational — never blocks creating a reservation or mini-event here.
  const [fullEventToday, setFullEventToday] = useState(false);
  useEffect(() => {
    if (!roomId || !date) {
      setFullEventToday(false);
      return;
    }
    let cancelled = false;
    hasFullEventOnDate(roomId, date)
      .then((has) => {
        if (!cancelled) setFullEventToday(has);
      })
      .catch(() => {
        if (!cancelled) failedToLoad();
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, date, refreshTick]);

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
      const color = !isTable
        ? "#737373"
        : selected
          ? "#F59E0B"
          : reserved
            ? "#DC2626"
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
        seatCount: isTable ? tableType?.seats : undefined,
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
    // "Претходен ден" clicked twice quickly: the older day's answer must not
    // overwrite the newer one.
    let cancelled = false;
    listReservationsForDate(venueId, date)
      .then((list) => {
        if (!cancelled) setDayReservations(list);
      })
      .catch(() => {
        if (!cancelled) failedToLoad();
      });
    return () => {
      cancelled = true;
    };
  }, [venueId, date, isSubmitting, refreshTick]);

  const filteredDayReservations = dayReservations.filter((r) => {
    if (listRoomFilter !== "all" && r.room_id !== listRoomFilter) return false;
    if (search && !r.guest_name.toLowerCase().includes(search.toLowerCase()) && !r.phone.includes(search)) return false;
    return true;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setServerNameMissing(false);
    if (selectedTableIds.length === 0) {
      setError("Изберете барем една маса.");
      return;
    }
    if (!serverName.trim()) {
      setServerNameMissing(true);
      setError("Внесете кој келнер ја прави резервацијата.");
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
        server_name: serverName.trim(),
        table_ids: selectedTableIds,
      });
      setReservations((prev) => [...prev, created]);
      setDayReservations((prev) => [...prev, created]);
      setGuestName("");
      setPhone("");
      setEmail("");
      setNote("");
      setServerName("");
      setSelectedTableIds([]);
    } catch (err) {
      setError(errorMessage(err, "Не успеа резервацијата. Обидете се повторно."));
    } finally {
      setIsSubmitting(false);
    }
  }

  // Cancelling deletes the reservation for good (there is no resting
  // "cancelled" record), so it asks first. Project B §6: a mini-event's own
  // table claim follows the event, not the reservation in isolation — its
  // row is deleted here too (cascade, migration 0139), never leaving an
  // orphaned mini-event stripped of its dashboard.
  async function handleCancel(id: string) {
    const reservation = dayReservations.find((r) => r.id === id) ?? reservations.find((r) => r.id === id);
    const who = reservation ? ` на ${reservation.guest_name}` : "";
    const isMiniEvent = Boolean(reservation?.event_id);
    const confirmMessage = isMiniEvent
      ? `Да се откаже мини настанот${who}? Ова го брише целиот настан (гости, мени, сè) и не може да се врати.`
      : `Да се откаже резервацијата${who}? Ова не може да се врати.`;
    if (!window.confirm(confirmMessage)) return;
    setError(null);
    try {
      if (isMiniEvent) {
        await deleteEventViaApi(reservation!.event_id!, managerToken);
      } else {
        await deleteReservation(id);
      }
      setReservations((prev) => prev.filter((r) => r.id !== id));
      setDayReservations((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(errorMessage(err, "Не успеа откажувањето на резервацијата. Обидете се повторно."));
    }
  }

  // reserved -> seated is a real status change (table now occupied).
  // seated -> "guests left" deletes the reservation outright: once the
  // table is freed, there's no resting "completed" record to keep around.
  async function handleToggleOccupied(id: string, currentStatus: ReservationStatus) {
    setError(null);
    try {
      if (currentStatus === "reserved") {
        await updateReservationStatus(id, "seated");
        setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status: "seated" } : r)));
        setDayReservations((prev) => prev.map((r) => (r.id === id ? { ...r, status: "seated" } : r)));
      } else {
        await deleteReservation(id);
        setReservations((prev) => prev.filter((r) => r.id !== id));
        setDayReservations((prev) => prev.filter((r) => r.id !== id));
      }
    } catch (err) {
      setError(errorMessage(err, "Не успеа промената на резервацијата. Обидете се повторно."));
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
            <label className="lab-s" htmlFor="qb-date">Датум</label>
            <input id="qb-date" type="date" className="fld" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="qb-field qb-field-time">
            <label className="lab-s" htmlFor="qb-start-time">Термин</label>
            <div className="qb-time-row">
              <div className="seg">
                {TIME_PRESETS.map((t) => (
                  <button key={t} type="button" aria-pressed={startTime === t} onClick={() => setStartTime(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <input
                id="qb-start-time"
                type="time"
                className="fld qb-time-exact"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>
          <div className="qb-field">
            <label className="lab-s" htmlFor="qb-end-time">До (опционално)</label>
            <input id="qb-end-time" type="time" className="fld" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
          <div className="qb-field qb-field-narrow">
            <label className="lab-s" htmlFor="qb-party-size">Гости</label>
            <input
              id="qb-party-size"
              type="number"
              className="fld"
              min={1}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
            />
          </div>
          <div className="qb-field qb-field-grow">
            <span className="lab-s" id="qb-room-label">Сала</span>
            <div className="seg" role="group" aria-labelledby="qb-room-label">
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

      {loadError ? (
        <p role="alert" className="qb-load-error" style={{ color: "var(--bad)", margin: "0 0 12px" }}>
          {loadError}{" "}
          <button type="button" className="btn btn-ghost" onClick={() => setRefreshTick((n) => n + 1)}>
            Обиди се повторно
          </button>
        </p>
      ) : null}

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

          {room ? (
            <p className="qb-canvas-caption">
              {room.name} — распоред на маси за {formatVenueDatePadded(date)} во {startTime}
            </p>
          ) : null}

          <div ref={canvasWrapRef} className="qb-canvas-wrap">
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
                  watermarkUrl={logoUrl}
                />
              ) : null}
            </div>
          </div>

          <div className="qb-legend">
            <span><i style={{ background: "#16A34A" }} /> Слободна</span>
            <span><i style={{ background: "#DC2626" }} /> Резервирана</span>
            <span><i style={{ background: "#F59E0B" }} /> Избрана</span>
          </div>

          {selectedTables.length > 0 ? (
            <div className="foot qb-selected-foot">
              <span className="count">
                Избрани маси: <b>{selectedTables.map((t) => t.label).join(", ")}</b> ({selectedCapacity} места)
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => setSelectedTableIds([])}>
                Одгрупирај маси
              </button>
            </div>
          ) : null}

          {room ? (
            <div style={{ marginTop: 14 }}>
              <p className="lab-s" style={{ margin: "0 0 6px" }}>
                {busiestHourReserved} од {totalTables} маси зафатени денес
              </p>
              {fullEventToday ? (
                <p className="ev-hint" style={{ marginBottom: 10 }}>
                  Овој датум има настан со целосен капацитет во оваа сала.
                </p>
              ) : null}
              <HourOccupancySlider hours={hourlyOccupancy} activeHour={activeHour} onHourChange={handleHourChange} />
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
                <label className="lab-s" htmlFor="res-guest-name">Име и презиме</label>
                <input id="res-guest-name" className="fld" placeholder="Име и презиме" value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label className="lab-s" htmlFor="res-phone">Телефон</label>
                <input id="res-phone" className="fld" placeholder="Телефон" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label className="lab-s" htmlFor="res-email">Е-пошта (незадолжително)</label>
                <input id="res-email" className="fld" placeholder="Е-пошта" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label className="lab-s" htmlFor="res-note">Белешка (опционално)</label>
                <input id="res-note" className="fld" placeholder="Белешка" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <label className="lab-s" htmlFor="res-server-name">
                  Келнер <span className="req">*</span>
                </label>
                <input
                  id="res-server-name"
                  className="fld"
                  aria-required="true"
                  aria-invalid={serverNameMissing || undefined}
                  aria-describedby={serverNameMissing ? "res-form-error" : undefined}
                  placeholder="Кој ја прави резервацијата"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                />
              </div>
              {error ? (
                <p id="res-form-error" role="alert" style={{ color: "var(--bad)" }}>
                  {error}
                </p>
              ) : null}
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
              <span>Келнер</span>
              <span>Статус</span>
              <span></span>
            </div>
            {filteredDayReservations.map((r) => {
              const status = RESERVATION_STATUS_META[r.status];
              const roomForRow = rooms.find((room) => room.id === r.room_id);
              return (
                <div className="qb-slot-row" key={r.id}>
                  <span>{r.start_time.slice(0, 5)}</span>
                  <span>
                    <b>{r.guest_name}</b>
                    {r.event_id ? <span className="pill p-info" style={{ marginLeft: 6 }}>Мини настан</span> : null}
                  </span>
                  <span>{r.phone}</span>
                  <span>{roomForRow?.name ?? "—"}</span>
                  <span>{r.party_size}</span>
                  <span>{r.server_name ?? "—"}</span>
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
