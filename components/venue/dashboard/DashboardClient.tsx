"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/venue/shell/Icon";
import { STATUS_META, TYPE_META, formatTimeRange } from "@/lib/venue/event-display";
import type { RoomWithSeatTotal, TableType } from "@/lib/venue/rooms";
import type { MenuTemplateWithItemCount } from "@/lib/venue/menus";
import type { EventDetail } from "@/lib/venue/events";
import { RESERVATION_STATUS_META, type Reservation } from "@/lib/venue/reservations";
import { FloorPlanCanvas, PX_PER_CM, type CanvasElement } from "./FloorPlanCanvas";
import { FIXED_TYPE_COLORS, numberTables, type FixedElement, type RoomLayoutElement } from "@/lib/venue/floorplan";

/** Max height (px) the scaled-down mini floor-plan is allowed to take up. */
const MINI_FLOORPLAN_MAX_HEIGHT = 550;

export interface RoomLayout {
  fixedElements: FixedElement[];
  layoutElements: RoomLayoutElement[];
  tableTypes: TableType[];
}

const MK_MONTHS = [
  "Јануари", "Февруари", "Март", "Април", "Мај", "Јуни",
  "Јули", "Август", "Септември", "Октомври", "Ноември", "Декември",
];
const MK_DAYS_SHORT = ["Пон", "Вто", "Сре", "Чет", "Пет", "Саб", "Нед"];
const MK_DAYS_LONG = ["Недела", "Понеделник", "Вторник", "Среда", "Четврток", "Петок", "Сабота"];

function formatDateLong(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return `${MK_DAYS_LONG[d.getDay()]}, ${d.getDate()} ${MK_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Intl's mk-MK thousands-separator formatting differs between Node (SSR) and
// the browser (client render), which trips a hydration mismatch — so this
// formats manually instead of via toLocaleString.
function formatCount(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
const QUICK_ACTIONS = [
  { href: "/venue/events/new", icon: "plus", title: "КРЕИРАЈ НАСТАН", sub: "Нов настан за секунди", primary: true },
  { href: "/venue/events", icon: "cal-dot", title: "НАСТАНИ", sub: "Сите настани и прослави", primary: false },
  { href: "/venue/tables", icon: "tables", title: "РАСПОРЕД НА МАСИ", sub: "План на сала", primary: false },
  { href: "/venue/menus", icon: "menu", title: "МЕНИ / ПАКЕТИ", sub: "Менија и јадења", primary: false },
  { href: "/venue/calendar", icon: "cal", title: "КАЛЕНДАР", sub: "Преглед по денови", primary: false },
];

/** A panel with nothing to show yet, distinguishing "no data" from "not built". */
function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="empty" style={{ padding: "34px 20px" }}>
      {children}
    </div>
  );
}

export function DashboardClient({
  today,
  rooms,
  roomLayouts,
  menuTemplates,
  todayEvents,
  todayReservations,
  upcomingEvents,
  weekCounts,
  monthEventDays,
  monthLabel,
  nextMonthEventDays,
  nextMonthLabel,
  stats,
}: {
  today: string;
  rooms: RoomWithSeatTotal[];
  roomLayouts: Record<string, RoomLayout>;
  menuTemplates: MenuTemplateWithItemCount[];
  todayEvents: EventDetail[];
  todayReservations: Reservation[];
  upcomingEvents: EventDetail[];
  weekCounts: { iso: string; count: number }[];
  monthEventDays: Record<number, number>;
  monthLabel: string;
  nextMonthEventDays: Record<number, number>;
  nextMonthLabel: string;
  stats: {
    todayCount: number;
    todayGuests: number;
    peakGuests: number;
    inPreparation: number;
    completedToday: number;
    upcomingCount: number;
    totalCapacity: number;
  };
}) {
  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id ?? "");
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const selectedLayout = roomLayouts[selectedRoomId];

  // Any reservation today that hasn't been cancelled or already completed
  // marks its table(s) as taken — status doesn't matter beyond that for this
  // at-a-glance view (unlike the booking flow on /venue/reservations, this
  // panel has no time-slot picker, so it answers "is this table used at all
  // today", not "is it free right now"). A completed reservation means the
  // table already freed up.
  const reservedTableIds = new Set(
    todayReservations.filter((r) => r.status !== "cancelled" && r.status !== "completed").flatMap((r) => r.table_ids)
  );

  const tableNumbers = useMemo(
    () => (selectedLayout ? numberTables(selectedLayout.layoutElements) : new Map<string, number>()),
    [selectedLayout]
  );

  const roomCanvasElements: CanvasElement[] = selectedLayout
    ? [
        ...selectedLayout.fixedElements.map((el) => ({
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
        ...selectedLayout.layoutElements.map((el) => {
          const isTable = el.element_type === "table";
          const tableType = el.table_type_id ? selectedLayout.tableTypes.find((tt) => tt.id === el.table_type_id) : null;
          const shape: "rect" | "circle" = isTable && tableType?.shape === "round" ? "circle" : "rect";
          const color = !isTable ? "#737373" : reservedTableIds.has(el.id) ? "#DC2626" : "#16A34A";
          return {
            id: el.id,
            x_cm: el.x_cm,
            y_cm: el.y_cm,
            width_cm: el.width_cm,
            height_cm: el.length_cm,
            color,
            label:
              isTable && tableNumbers.get(el.id) != null
                ? tableType
                  ? `${tableNumbers.get(el.id)} (${tableType.seats})`
                  : String(tableNumbers.get(el.id))
                : (el.label ?? tableType?.name ?? el.element_type),
            shape,
            locked: true,
          };
        }),
      ]
    : [];

  // Scale the mini floor-plan down to fit the panel entirely, instead of
  // clipping a real-scale render behind a scrollbar — this is an at-a-glance
  // overview, not the editable floor-plan page, so the whole room should
  // always be visible at once regardless of its real-world size.
  const floorplanWrapperRef = useRef<HTMLDivElement>(null);
  const [floorplanContainerWidth, setFloorplanContainerWidth] = useState(0);
  useEffect(() => {
    const el = floorplanWrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setFloorplanContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const roomCanvasWidthPx = (selectedRoom?.width_cm ?? 0) * PX_PER_CM;
  const roomCanvasHeightPx = (selectedRoom?.height_cm ?? 0) * PX_PER_CM;
  const floorplanScale =
    roomCanvasWidthPx > 0 && roomCanvasHeightPx > 0 && floorplanContainerWidth > 0
      ? Math.min(floorplanContainerWidth / roomCanvasWidthPx, MINI_FLOORPLAN_MAX_HEIGHT / roomCanvasHeightPx, 1)
      : 1;

  const maxWeek = Math.max(1, ...weekCounts.map((w) => w.count));
  const occupancy =
    stats.totalCapacity > 0
      ? Math.round((stats.peakGuests / stats.totalCapacity) * 100)
      : null;
  const overCapacity = occupancy != null && occupancy > 100;

  // Month grid, Monday-first, for the mini calendar — shared by both the
  // current and next month's blocks.
  function buildMonthCells(year: number, month: number): (number | null)[] {
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: days }, (_, i) => i + 1),
    ];
  }
  const todayDate = new Date(`${today}T00:00:00`);
  const monthCells = buildMonthCells(todayDate.getFullYear(), todayDate.getMonth());
  const todayDay = Number(today.slice(8, 10));

  const nextMonthDate = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 1);
  const nextMonthCells = buildMonthCells(nextMonthDate.getFullYear(), nextMonthDate.getMonth());

  return (
    <div className="wrap">
      <section className="quick-row">
        {QUICK_ACTIONS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className={`qa${a.primary ? " qa-primary" : ""}`}
          >
            <span className="qa-ic"><Icon name={a.icon} size="lg" /></span>
            <span className="qa-tx">
              <b>{a.title}</b>
              <span>{a.sub}</span>
            </span>
          </Link>
        ))}
      </section>

      <div className="day-head">
        <span className="day-dot" />
        ДЕНЕС — {formatDateLong(today).toUpperCase()}
      </div>

      <section className="tiles" aria-label="Преглед за денес">
        <div className="tile">
          <span className="badge"><Icon name="cal-dot" size="lg" /></span>
          <div>
            <div className="num">{stats.todayCount}</div>
            <div className="lab">Настани денес<span>во сите статуси</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="users" size="lg" /></span>
          <div>
            <div className="num">{formatCount(stats.todayGuests)}</div>
            <div className="lab">Гости денес<span>по проценка</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="occ" size="lg" /></span>
          <div>
            <div className="num" style={overCapacity ? { color: "var(--bad)" } : undefined}>
              {occupancy != null ? `${occupancy}%` : "—"}
            </div>
            <div className="lab">
              Пополнетост
              <span>
                {occupancy == null
                  ? "нема дефинирани маси"
                  : overCapacity
                    ? `${stats.peakGuests} гости > ${stats.totalCapacity} места`
                    : `${stats.peakGuests} од ${stats.totalCapacity} места`}
              </span>
            </div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="clock" size="lg" /></span>
          <div>
            <div className="num">{stats.inPreparation}</div>
            <div className="lab">Во подготовка<span>потребна потврда</span></div>
          </div>
        </div>
        <div className="tile">
          <span className="badge"><Icon name="check" size="lg" /></span>
          <div>
            <div className="num">{stats.completedToday}</div>
            <div className="lab">Завршени<span>денес</span></div>
          </div>
        </div>
      </section>

      <div className="dash-grid">
        {/* ---- today's reservations ---- */}
        <section className="panel">
          <div className="panel-h">
            <h2 className="panel-t">
              <Icon name="book" size="sm" /> Резервации за денес
            </h2>
            <span className="count">{todayReservations.length} резервации</span>
          </div>
          {todayReservations.length === 0 ? (
            <EmptyNote>
              <b>Нема резервации денес</b>
              Нема закажани резервации за {formatDateLong(today)}.
            </EmptyNote>
          ) : (
            <div style={{ padding: "6px 8px" }}>
              {todayReservations.map((r) => {
                const status = RESERVATION_STATUS_META[r.status];
                const room = rooms.find((room) => room.id === r.room_id);
                return (
                  <div className="plan-row" key={r.id}>
                    <span className="plan-dot" style={{ background: "var(--gold)" }} />
                    <span className="plan-time">{r.start_time.slice(0, 5)}</span>
                    <span className="plan-name">
                      <b>{r.guest_name}</b>
                      <span>
                        {[r.phone, room?.name, `${r.party_size} гости`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className={`pill ${status.pill}`}>{status.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="foot">
            <Link className="btn btn-ghost" href="/venue/reservations">
              Види ги сите резервации <Icon name="right" size="sm" />
            </Link>
          </div>
        </section>

        {/* ---- floor-plan mini overview ---- */}
        <section className="panel">
          <div className="panel-h">
            <h2 className="panel-t">
              <Icon name="tables" size="sm" /> Распоред на маси
            </h2>
            {rooms.length > 1 ? (
              <div className="seg">
                {rooms.map((room) => (
                  <button
                    key={room.id}
                    type="button"
                    aria-pressed={selectedRoomId === room.id}
                    onClick={() => setSelectedRoomId(room.id)}
                  >
                    {room.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {!selectedRoom || !selectedLayout ? (
            <EmptyNote>
              <b>Нема простории</b>
              Додадете просторија и маси за да се прикаже распоредот.
            </EmptyNote>
          ) : (
            <>
              <div className="mini-floorplan-legend">
                <span><i style={{ background: "#16A34A" }} /> Слободна</span>
                <span><i style={{ background: "#DC2626" }} /> Резервирана</span>
              </div>
              <div
                ref={floorplanWrapperRef}
                className="mini-floorplan"
                style={{ height: roomCanvasHeightPx * floorplanScale }}
              >
                <div
                  style={{
                    width: roomCanvasWidthPx,
                    height: roomCanvasHeightPx,
                    transform: `scale(${floorplanScale})`,
                    transformOrigin: "top left",
                  }}
                >
                  <FloorPlanCanvas
                    widthCm={selectedRoom.width_cm}
                    heightCm={selectedRoom.height_cm}
                    elements={roomCanvasElements}
                    selectedElementId={null}
                    onSelect={() => {}}
                    onMoveEnd={() => {}}
                    onResizeEnd={() => {}}
                    onRotateEnd={() => {}}
                    onDelete={() => {}}
                  />
                </div>
              </div>
            </>
          )}
          <div className="foot">
            <span className="count">
              Вкупен капацитет: <b>{stats.totalCapacity}</b> места
              {" · "}
              {menuTemplates.length} менија
            </span>
            <Link className="btn btn-ghost" href="/venue/tables">
              Уреди распоред
            </Link>
          </div>
        </section>

        {/* ---- day plan ---- */}
        <section className="panel">
          <div className="panel-h">
            <h2 className="panel-t">
              <Icon name="note" size="sm" /> Дневен план
            </h2>
            <span className="count">{todayEvents.length} закажани</span>
          </div>
          {todayEvents.length === 0 ? (
            <EmptyNote>
              <b>Нема настани денес</b>
              Слободен ден — нема закажани настани за {formatDateLong(today)}.
            </EmptyNote>
          ) : (
            <div style={{ padding: "6px 8px" }}>
              {todayEvents.map((ev) => {
                const type = TYPE_META[ev.event_type];
                const status = STATUS_META[ev.status];
                const range = formatTimeRange(ev.start_time, ev.end_time);
                const roomNames = ev.room_ids
                  .map((id) => rooms.find((r) => r.id === id)?.name)
                  .filter(Boolean)
                  .join(", ");
                return (
                  <div className="plan-row" key={ev.id}>
                    <span className="plan-dot" style={{ background: type.color }} />
                    <span className="plan-time">{range ?? "Без време"}</span>
                    <span className="plan-name">
                      <b>{ev.couple_names}</b>
                      <span>
                        {[
                          type.label,
                          roomNames || null,
                          ev.guest_count_estimate != null
                            ? `${ev.guest_count_estimate} гости`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className={`pill ${status.pill}`}>{status.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="foot">
            <Link className="btn btn-ghost" href="/venue/events?filter=today">
              Види ги сите настани за денес <Icon name="right" size="sm" />
            </Link>
          </div>
        </section>

        {/* ---- week overview ---- */}
        <section className="panel">
          <div className="panel-h">
            <h2 className="panel-t">Преглед на неделата</h2>
          </div>
          <div style={{ padding: "12px 16px 16px" }}>
            {weekCounts.map((w, i) => (
              <div className="wk-row" key={w.iso}>
                <span className="wk-day">{MK_DAYS_SHORT[i]}</span>
                <span className="wk-bar">
                  <span style={{ width: `${(w.count / maxWeek) * 100}%` }} />
                </span>
                <span className="wk-n">{w.count} наст.</span>
              </div>
            ))}
          </div>
        </section>

        {/* ---- upcoming events ---- */}
        <section className="panel">
          <div className="panel-h">
            <h2 className="panel-t">Претстојни настани</h2>
          </div>
          {upcomingEvents.length === 0 ? (
            <EmptyNote>Нема претстојни настани.</EmptyNote>
          ) : (
            <div style={{ padding: "8px 14px 14px" }}>
              {upcomingEvents.map((ev) => {
                const type = TYPE_META[ev.event_type];
                return (
                  <div className="up-row" key={ev.id}>
                    <span className="up-dot" style={{ background: type.color }} />
                    <span>
                      <b>{ev.couple_names}</b>
                      <span>
                        {new Date(`${ev.event_date}T00:00:00`).getDate()}{" "}
                        {MK_MONTHS[new Date(`${ev.event_date}T00:00:00`).getMonth()]}
                        {formatTimeRange(ev.start_time, ev.end_time)
                          ? ` · ${formatTimeRange(ev.start_time, ev.end_time)}`
                          : ""}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ---- month overview: this month + next, side by side ---- */}
        <section className="panel">
          <div className="panel-h">
            <h2 className="panel-t">Месечен преглед</h2>
          </div>
          <div className="mini-cal-row">
            <div className="mini-cal-block">
              <p className="mini-cal-label">{monthLabel}</p>
              <div className="mini-cal">
                {MK_DAYS_SHORT.map((d) => (
                  <span className="mc-h" key={d}>{d.slice(0, 1)}</span>
                ))}
                {monthCells.map((day, i) => (
                  <span
                    key={i}
                    className={`mc-d${day === todayDay ? " is-today" : ""}${day == null ? " is-blank" : ""}`}
                  >
                    {day ?? ""}
                    {day != null && monthEventDays[day] ? <i className="mc-dot" /> : null}
                  </span>
                ))}
              </div>
            </div>
            <div className="mini-cal-block">
              <p className="mini-cal-label">{nextMonthLabel}</p>
              <div className="mini-cal">
                {MK_DAYS_SHORT.map((d) => (
                  <span className="mc-h" key={d}>{d.slice(0, 1)}</span>
                ))}
                {nextMonthCells.map((day, i) => (
                  <span key={i} className={`mc-d${day == null ? " is-blank" : ""}`}>
                    {day ?? ""}
                    {day != null && nextMonthEventDays[day] ? <i className="mc-dot" /> : null}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="foot">
            <Link className="btn btn-ghost" href="/venue/calendar">
              Отвори календар <Icon name="right" size="sm" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
