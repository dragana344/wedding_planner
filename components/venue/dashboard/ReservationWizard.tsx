"use client";

import "./reservation-wizard.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import { TimeInput } from "@/components/shared/TimeInput";
import { FloorPlanCanvas, PX_PER_CM, type CanvasElement } from "./FloorPlanCanvas";
import { HourOccupancySlider } from "./HourOccupancySlider";
import { fitZoom } from "@/lib/seating/zoom-to-fit";
import { computeHourlyTableOccupancy } from "@/lib/venue/occupancy";
import { formatMkDateWithWeekday } from "@/lib/date";
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
  listReservationsForRoom,
  type Reservation,
} from "@/lib/venue/reservations";
import { hasFullEventOnDate } from "@/lib/venue/events";
import { errorMessage } from "@/lib/venue/user-error";

export const TIME_PRESETS = ["11:00", "15:00", "17:00", "20:00", "22:00"];
const LOAD_ERROR = "Податоците за салата не можеа да се вчитаат.";

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayIso(): string {
  return isoOf(new Date());
}
function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoOf(d);
}

type Step = 1 | 2 | 3;
const STEP_LABELS: Record<Step, string> = { 1: "Кога", 2: "Маса", 3: "Гостин" };

/**
 * New table reservation (not an event), as three short steps in a window:
 * when + how many → which table → who. A bottom sheet on phones, a centred
 * window on a laptop. Availability colours are advisory only; the server
 * runs its own conflict check on submit.
 */
export function ReservationWizard({
  venueId,
  rooms,
  logoUrl,
  onCreated,
  onClose,
}: {
  venueId: string;
  rooms: RoomWithSeatTotal[];
  logoUrl: string | null;
  onCreated: (created: Reservation) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState(TIME_PRESETS[0]);
  const [customTime, setCustomTime] = useState(false);
  const [endTime, setEndTime] = useState("");
  const [showEnd, setShowEnd] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [partySize, setPartySize] = useState(2);

  const [fixedElements, setFixedElements] = useState<FixedElement[]>([]);
  const [layoutElements, setLayoutElements] = useState<RoomLayoutElement[]>([]);
  const [tableTypes, setTableTypes] = useState<TableType[]>([]);
  const [reservedTableIds, setReservedTableIds] = useState<string[]>([]);
  const [roomDayReservations, setRoomDayReservations] = useState<Reservation[]>([]);
  const [fullEventToday, setFullEventToday] = useState(false);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [tableView, setTableView] = useState<"list" | "map">("list");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const [guestName, setGuestName] = useState("");
  const [phone, setPhone] = useState("");
  const [serverName, setServerName] = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serverNameMissing, setServerNameMissing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const room = rooms.find((r) => r.id === roomId);

  // Escape closes; the page behind doesn't scroll while the window is open.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Each step starts at its top.
  useEffect(() => {
    dialogRef.current?.querySelector(".rw-body")?.scrollTo?.({ top: 0 });
  }, [step]);

  useEffect(() => {
    setSelectedTableIds([]);
  }, [roomId, date, startTime]);

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
        if (!cancelled) setLoadError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, refreshTick]);

  useEffect(() => {
    if (!roomId || !date) return;
    let cancelled = false;
    listReservationsForRoom(roomId, date)
      .then((list) => {
        if (!cancelled) setRoomDayReservations(list);
      })
      .catch(() => {
        if (!cancelled) setLoadError(LOAD_ERROR);
      });
    hasFullEventOnDate(roomId, date)
      .then((has) => {
        if (!cancelled) setFullEventToday(has);
      })
      .catch(() => {
        if (!cancelled) setFullEventToday(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, date, refreshTick]);

  const tableEls = useMemo(() => layoutElements.filter((el) => el.element_type === "table"), [layoutElements]);
  const tableNumbers = useMemo(() => numberTables(layoutElements), [layoutElements]);

  useEffect(() => {
    if (!roomId || !date || !startTime || tableEls.length === 0) {
      setReservedTableIds([]);
      return;
    }
    let cancelled = false;
    getTableAvailability(roomId, date, startTime, tableEls.map((t) => t.id), null)
      .then(({ reserved }) => {
        if (!cancelled) setReservedTableIds(reserved);
      })
      .catch(() => {
        if (!cancelled) setLoadError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, date, startTime, tableEls, refreshTick]);

  const hourly = useMemo(() => computeHourlyTableOccupancy(roomDayReservations, tableEls.length), [roomDayReservations, tableEls.length]);
  // Project B §4: how full the day gets at its busiest hour — information, never a gate.
  const busiestReserved = Math.max(0, ...hourly.map((h) => h.reservedTables));
  const freeAt = (time: string) => {
    const h = hourly[Number(time.slice(0, 2))];
    return h ? tableEls.length - h.reservedTables : tableEls.length;
  };

  const tables = useMemo(
    () =>
      tableEls
        .map((el) => {
          const type = el.table_type_id ? tableTypes.find((tt) => tt.id === el.table_type_id) : undefined;
          const number = tableNumbers.get(el.id);
          return {
            id: el.id,
            number: number ?? 0,
            label: number != null ? `Маса ${number}` : (el.label ?? type?.name ?? "Маса"),
            seats: type?.seats ?? 0,
            round: type?.shape === "round",
            reserved: reservedTableIds.includes(el.id),
          };
        })
        .sort((a, b) => a.number - b.number),
    [tableEls, tableTypes, tableNumbers, reservedTableIds],
  );
  const selected = tables.filter((t) => selectedTableIds.includes(t.id));
  const selectedSeats = selected.reduce((sum, t) => sum + t.seats, 0);
  const freeCount = tables.filter((t) => !t.reserved).length;

  function toggleTable(id: string) {
    setSelectedTableIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  // Map view: fit the room to the window's width once it's shown.
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (step !== 2 || tableView !== "map") return;
    const el = canvasWrapRef.current;
    if (!el || !room) return;
    // The whole room in view: fit the width, and the height the window allows.
    const maxH = Math.max(220, Math.min(window.innerHeight * (window.innerWidth <= 900 ? 0.5 : 0.48), 520));
    setZoom(Math.min(fitZoom(room.width_cm, PX_PER_CM, el.clientWidth - 10, 0.15), fitZoom(room.height_cm, PX_PER_CM, maxH, 0.15)));
  }, [step, tableView, room]);
  useEffect(() => {
    const el = canvasRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setCanvasSize({ w: el.offsetWidth, h: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [step, tableView]);

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
      const t = tables.find((x) => x.id === el.id);
      const color = !isTable ? "#737373" : selectedTableIds.includes(el.id) ? "#F59E0B" : t?.reserved ? "#DC2626" : "#16A34A";
      return {
        id: el.id,
        x_cm: el.x_cm,
        y_cm: el.y_cm,
        width_cm: el.width_cm,
        height_cm: el.length_cm,
        color,
        label: isTable && t ? `${t.number}${t.seats ? ` (${t.seats})` : ""}` : (el.label ?? el.element_type),
        shape: (isTable && t?.round ? "circle" : "rect") as "rect" | "circle",
        locked: !isTable,
        seatCount: isTable ? t?.seats : undefined,
      };
    }),
  ];

  const dateLabel = date === todayIso() ? "Денес" : date === tomorrowIso() ? "Утре" : formatMkDateWithWeekday(date);
  const summary = [
    formatMkDateWithWeekday(date),
    `${startTime}${endTime ? `–${endTime}` : ""}`,
    `${partySize} ${partySize === 1 ? "гостин" : "гости"}`,
    room?.name,
    selected.length ? selected.map((t) => t.label).join(", ") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function submit() {
    setError(null);
    setServerNameMissing(false);
    if (!guestName.trim() || !phone.trim()) {
      setError("Внесете име и телефон на гостинот.");
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
        guest_name: guestName.trim(),
        phone: phone.trim(),
        email: email || null,
        date,
        start_time: startTime,
        end_time: endTime || null,
        party_size: partySize,
        note: note || null,
        server_name: serverName.trim(),
        table_ids: selectedTableIds,
      });
      onCreated(created);
    } catch (err) {
      setError(errorMessage(err, "Не успеа резервацијата. Обидете се повторно."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="rw-scrim" onClick={onClose} aria-hidden />
      <div ref={dialogRef} tabIndex={-1} className="rw" role="dialog" aria-modal="true" aria-labelledby="rw-title">
        <header className="rw-head">
          <span className="rw-handle" aria-hidden />
          <h2 id="rw-title" className="rw-title">Нова резервација</h2>
          <button type="button" className="rw-close" aria-label="Затвори" onClick={onClose}>
            <Icon name="x" size="sm" />
          </button>
          <ol className="rw-steps" aria-label="Чекори">
            {([1, 2, 3] as Step[]).map((s) => (
              <li key={s} className={s === step ? "is-on" : s < step ? "is-done" : ""} aria-current={s === step ? "step" : undefined}>
                <span className="rw-step-n">{s < step ? <Icon name="tick" size="sm" /> : s}</span>
                {STEP_LABELS[s]}
              </li>
            ))}
          </ol>
        </header>

        <div className="rw-body">
          {loadError ? (
            <p role="alert" className="rw-error">
              {loadError}{" "}
              <button type="button" className="rw-link" onClick={() => setRefreshTick((n) => n + 1)}>
                Обиди се повторно
              </button>
            </p>
          ) : null}

          {step === 1 ? (
            <>
              <h3 className="rw-q">Кога?</h3>
              <div className="rw-chips" role="group" aria-label="Датум">
                <button type="button" aria-pressed={date === todayIso()} onClick={() => setDate(todayIso())}>
                  Денес
                </button>
                <button type="button" aria-pressed={date === tomorrowIso()} onClick={() => setDate(tomorrowIso())}>
                  Утре
                </button>
                <label className={`rw-date${date !== todayIso() && date !== tomorrowIso() ? " is-on" : ""}`}>
                  <Icon name="cal" size="sm" />
                  <span className="sr-only">Друг датум</span>
                  <input type="date" value={date} min={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Друг датум" />
                </label>
              </div>
              <p className="rw-hint">{formatMkDateWithWeekday(date)}</p>

              <h3 className="rw-q">Во колку часот?</h3>
              {tableEls.length ? (
                <p className="rw-hint rw-hint-top">
                  {busiestReserved} од {tableEls.length} маси зафатени {date === todayIso() ? "денес" : "тој ден"}
                </p>
              ) : null}
              <div className="rw-times" role="group" aria-label="Термин">
                {TIME_PRESETS.map((t) => {
                  const free = freeAt(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={!customTime && startTime === t}
                      onClick={() => {
                        setCustomTime(false);
                        setStartTime(t);
                      }}
                    >
                      <b>{t}</b>
                      {tableEls.length ? <span className={free === 0 ? "is-full" : ""}>{free === 0 ? "полно" : `${free} слободни`}</span> : null}
                    </button>
                  );
                })}
                <button type="button" aria-pressed={customTime} onClick={() => setCustomTime(true)}>
                  <b>Друго</b>
                  <span>точно време</span>
                </button>
              </div>
              {customTime ? (
                <div className="rw-field rw-field-inline">
                  <label htmlFor="rw-time">Точно време</label>
                  <TimeInput id="rw-time" className="fld" value={startTime} onChange={setStartTime} />
                </div>
              ) : null}
              {tableEls.length ? (
                showHours ? (
                  <div className="rw-hours">
                    <p className="rw-hint">Пополнетост низ денот — допрете час за да го изберете.</p>
                    <HourOccupancySlider
                      hours={hourly}
                      activeHour={Number(startTime.slice(0, 2))}
                      onHourChange={(hour) => {
                        const t = `${String(hour).padStart(2, "0")}:00`;
                        setCustomTime(!TIME_PRESETS.includes(t));
                        setStartTime(t);
                      }}
                    />
                  </div>
                ) : (
                  <button type="button" className="rw-link" onClick={() => setShowHours(true)}>
                    Прикажи пополнетост по час
                  </button>
                )
              ) : null}
              {showEnd ? (
                <div className="rw-field rw-field-inline">
                  <label htmlFor="rw-end">До кога (опционално)</label>
                  <TimeInput id="rw-end" className="fld" value={endTime} onChange={setEndTime} />
                </div>
              ) : (
                <button type="button" className="rw-link" onClick={() => setShowEnd(true)}>
                  + До кога (опционално)
                </button>
              )}

              <h3 className="rw-q">Колку гости?</h3>
              <div className="rw-stepper">
                <button type="button" aria-label="Еден гостин помалку" disabled={partySize <= 1} onClick={() => setPartySize((n) => Math.max(1, n - 1))}>
                  <Icon name="minus" size="sm" />
                </button>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  aria-label="Број на гости"
                  value={partySize}
                  onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
                />
                <button type="button" aria-label="Еден гостин повеќе" onClick={() => setPartySize((n) => n + 1)}>
                  <Icon name="plus" size="sm" />
                </button>
              </div>

              {rooms.length > 1 ? (
                <>
                  <h3 className="rw-q">Сала</h3>
                  <div className="rw-chips" role="group" aria-label="Сала">
                    {rooms.map((r) => (
                      <button key={r.id} type="button" aria-pressed={roomId === r.id} onClick={() => setRoomId(r.id)}>
                        {r.name}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              {fullEventToday ? <p className="rw-note">Овој датум има настан со целосен капацитет во оваа сала.</p> : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="rw-step2-head">
                <h3 className="rw-q">Изберете маса</h3>
                <div className="rw-seg" role="group" aria-label="Приказ">
                  <button type="button" aria-pressed={tableView === "list"} onClick={() => setTableView("list")}>
                    Листа
                  </button>
                  <button type="button" aria-pressed={tableView === "map"} onClick={() => setTableView("map")}>
                    Мапа
                  </button>
                </div>
              </div>
              <p className="rw-hint">
                {room?.name} · {dateLabel} во {startTime} · {freeCount} од {tables.length} маси слободни
              </p>
              {tableView === "list" ? (
                <ul className="rw-tables">
                  {tables.map((t) => {
                    const on = selectedTableIds.includes(t.id);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          disabled={t.reserved && !on}
                          onClick={() => toggleTable(t.id)}
                          className={`rw-table${on ? " is-on" : ""}${t.reserved ? " is-taken" : ""}`}
                        >
                          <span className="rw-table-dot" aria-hidden />
                          <span className="rw-table-name">{t.label}</span>
                          <span className="rw-table-seats">{t.seats} места</span>
                          <span className="rw-table-state">{on ? "Избрана" : t.reserved ? "Зафатена" : "Слободна"}</span>
                        </button>
                      </li>
                    );
                  })}
                  {tables.length === 0 ? <li className="rw-hint">Во оваа сала нема маси.</li> : null}
                </ul>
              ) : (
                <>
                  <div ref={canvasWrapRef} className="rw-map">
                    {room ? (
                      <div className="rw-map-sizer" style={canvasSize ? { width: canvasSize.w * zoom, height: canvasSize.h * zoom } : undefined}>
                      <div ref={canvasRef} style={{ transform: `scale(${zoom})`, transformOrigin: "top left", width: "max-content" }}>
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
                      </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="rw-legend">
                    <span><i style={{ background: "#16A34A" }} /> Слободна</span>
                    <span><i style={{ background: "#DC2626" }} /> Зафатена</span>
                    <span><i style={{ background: "#F59E0B" }} /> Избрана</span>
                  </div>
                </>
              )}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="rw-summary">
                <span className="rw-summary-eyebrow">Резервација</span>
                <p>{summary}</p>
                <button type="button" className="rw-link" onClick={() => setStep(1)}>
                  Промени
                </button>
              </div>
              <form
                id="rw-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <div className="rw-field">
                  <label htmlFor="res-guest-name">Име и презиме</label>
                  <input id="res-guest-name" className="fld" autoComplete="off" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                </div>
                <div className="rw-field">
                  <label htmlFor="res-phone">Телефон</label>
                  <input id="res-phone" className="fld" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="rw-field">
                  <label htmlFor="res-server-name">
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
                {showExtra ? (
                  <>
                    <div className="rw-field">
                      <label htmlFor="res-email">Е-пошта (незадолжително)</label>
                      <input id="res-email" className="fld" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="rw-field">
                      <label htmlFor="res-note">Белешка (опционално)</label>
                      <input id="res-note" className="fld" value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>
                  </>
                ) : (
                  <button type="button" className="rw-link" onClick={() => setShowExtra(true)}>
                    + Е-пошта и белешка
                  </button>
                )}
              </form>
            </>
          ) : null}

          {error ? (
            <p id="res-form-error" role="alert" className="rw-error">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="rw-foot">
          {step === 2 ? (
            <p className="rw-picked">
              {selected.length ? (
                <>
                  <b>{selected.map((t) => t.label).join(", ")}</b> · {selectedSeats} места за {partySize}
                  {selectedSeats > 0 && selectedSeats < partySize ? <span className="rw-warn"> — премалку места</span> : null}
                </>
              ) : (
                "Допрете слободна маса"
              )}
            </p>
          ) : null}
          <div className="rw-actions">
            {step > 1 ? (
              <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => (s - 1) as Step)}>
                <Icon name="left" size="sm" /> Назад
              </button>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Откажи
              </button>
            )}
            {step < 3 ? (
              <button
                key="next"
                type="button"
                className="btn btn-gold"
                disabled={step === 2 && selected.length === 0}
                onClick={() => {
                  setError(null);
                  setStep((s) => (s + 1) as Step);
                }}
              >
                Понатаму <Icon name="right" size="sm" />
              </button>
            ) : (
              <button key="submit" type="submit" form="rw-form" className="btn btn-gold rw-submit" disabled={isSubmitting}>
                {isSubmitting ? "Се резервира..." : "Резервирај"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </>
  );
}
