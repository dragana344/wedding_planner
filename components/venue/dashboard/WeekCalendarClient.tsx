"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/venue/shell/Icon";
import { STATUS_META, TYPE_META, formatTimeRange } from "@/lib/venue/event-display";
import type { EventDetail, EventStatus, EventType } from "@/lib/venue/events";
import type { RoomWithSeatTotal } from "@/lib/venue/rooms";

type ViewMode = "day" | "week" | "month";

const MK_MONTHS = [
  "Јануари", "Февруари", "Март", "Април", "Мај", "Јуни",
  "Јули", "Август", "Септември", "Октомври", "Ноември", "Декември",
];
const MK_DAYS_SHORT = ["Пон", "Вто", "Сре", "Чет", "Пет", "Саб", "Нед"];
const MK_DAYS_LONG = ["Понеделник", "Вторник", "Среда", "Четврток", "Петок", "Сабота", "Недела"];

// The grid only renders this hour range — venue events never start before 8am
// or run past midnight in practice, and a full 24-row grid would mostly be
// empty, unscrollable dead space on a dashboard-style page.
const HOUR_START = 8;
const HOUR_END = 24;
const ROW_HEIGHT = 44;
const GRID_HEIGHT = (HOUR_END - HOUR_START) * ROW_HEIGHT;

function isoOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}
function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7; // Monday-first
  return addDays(d, -day);
}
function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
function buildMonthCells(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
}

export function WeekCalendarClient({
  rooms,
  events,
  totalCapacity,
}: {
  rooms: RoomWithSeatTotal[];
  events: EventDetail[];
  totalCapacity: number;
}) {
  const today = useMemo(() => new Date(), []);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState(today);
  const [miniCalMonth, setMiniCalMonth] = useState(today);
  const [roomFilter, setRoomFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | EventType>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | EventStatus>("all");

  const filteredEvents = useMemo(
    () =>
      events.filter(
        (ev) =>
          (roomFilter === "all" || ev.room_ids.includes(roomFilter)) &&
          (typeFilter === "all" || ev.event_type === typeFilter) &&
          (statusFilter === "all" || ev.status === statusFilter)
      ),
    [events, roomFilter, typeFilter, statusFilter]
  );

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventDetail[]>();
    for (const ev of filteredEvents) {
      map.set(ev.event_date, [...(map.get(ev.event_date) ?? []), ev]);
    }
    return map;
  }, [filteredEvents]);

  const weekStart = startOfWeek(anchor);
  const daysInView = viewMode === "day" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const rangeStartIso = isoOf(daysInView[0]);
  const rangeEndIso = isoOf(daysInView[daysInView.length - 1]);

  const rangeLabel =
    viewMode === "day"
      ? `${MK_DAYS_LONG[(anchor.getDay() + 6) % 7]}, ${anchor.getDate()} ${MK_MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
      : viewMode === "week"
        ? `${weekStart.getDate()} – ${addDays(weekStart, 6).getDate()} ${MK_MONTHS[addDays(weekStart, 6).getMonth()]} ${weekStart.getFullYear()}`
        : `${MK_MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;

  function step(dir: 1 | -1) {
    if (viewMode === "day") setAnchor((d) => addDays(d, dir));
    else if (viewMode === "week") setAnchor((d) => addDays(d, dir * 7));
    else setAnchor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  }
  function jumpToToday() {
    setAnchor(today);
    setMiniCalMonth(today);
  }
  // Direct month/year jump — keeps the anchor's day-of-month where possible
  // (clamped to the target month's last day) so switching years in Day/Week
  // view doesn't silently reset which day is selected.
  function jumpToMonthYear(year: number, month: number) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    const next = new Date(year, month, Math.min(anchor.getDate(), lastDay));
    setAnchor(next);
    setMiniCalMonth(next);
  }
  const yearOptions = useMemo(() => {
    const current = today.getFullYear();
    const options = new Set<number>();
    for (let y = current - 5; y <= current + 5; y++) options.add(y);
    options.add(anchor.getFullYear());
    options.add(miniCalMonth.getFullYear());
    return Array.from(options).sort((a, b) => a - b);
  }, [today, anchor, miniCalMonth]);

  // Events in the visible range, for the sidebar donut + bottom stat row —
  // recomputed whenever the date range or filters change.
  const visibleEvents = useMemo(
    () => filteredEvents.filter((ev) => ev.event_date >= rangeStartIso && ev.event_date <= rangeEndIso),
    [filteredEvents, rangeStartIso, rangeEndIso]
  );

  const typeCounts = useMemo(() => {
    const counts = new Map<EventType, number>();
    for (const ev of visibleEvents) counts.set(ev.event_type, (counts.get(ev.event_type) ?? 0) + 1);
    return counts;
  }, [visibleEvents]);

  const avgOccupancy =
    totalCapacity > 0 && visibleEvents.length > 0
      ? Math.round(
          (visibleEvents.reduce((s, ev) => s + (ev.guest_count_estimate ?? 0), 0) /
            (visibleEvents.length * totalCapacity)) *
            100
        )
      : null;
  const cancelledCount = visibleEvents.filter((ev) => ev.status === "cancelled").length;

  const upcomingEvents = useMemo(() => {
    const todayIso = isoOf(today);
    return filteredEvents
      .filter((ev) => ev.event_date >= todayIso && ev.status !== "cancelled")
      .slice(0, 5);
  }, [filteredEvents, today]);

  const monthCells = buildMonthCells(miniCalMonth.getFullYear(), miniCalMonth.getMonth());
  const todayIso = isoOf(today);

  return (
    <div className="wrap cal-page">
      <section className="panel">
        <div className="panel-h cal-toolbar">
          <div className="seg">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
              >
                {mode === "day" ? "Ден" : mode === "week" ? "Недела" : "Месец"}
              </button>
            ))}
          </div>
          <div className="cal-nav">
            <button className="sq" type="button" aria-label="Претходно" onClick={() => step(-1)}>
              <Icon name="left" size="sm" />
            </button>
            <span className="cal-range">{rangeLabel}</span>
            <button className="sq" type="button" aria-label="Следно" onClick={() => step(1)}>
              <Icon name="right" size="sm" />
            </button>
            <button className="btn btn-ghost" type="button" onClick={jumpToToday}>
              Денес
            </button>
            <select
              className="fld cal-jump"
              aria-label="Оди на месец"
              value={anchor.getMonth()}
              onChange={(e) => jumpToMonthYear(anchor.getFullYear(), Number(e.target.value))}
            >
              {MK_MONTHS.map((name, i) => (
                <option key={name} value={i}>{name}</option>
              ))}
            </select>
            <select
              className="fld cal-jump"
              aria-label="Оди на година"
              value={anchor.getFullYear()}
              onChange={(e) => jumpToMonthYear(Number(e.target.value), anchor.getMonth())}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="cal-filters">
            <select className="fld" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
              <option value="all">Сите сали</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            <select
              className="fld"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as "all" | EventType)}
            >
              <option value="all">Сите типови</option>
              {(Object.keys(TYPE_META) as EventType[]).map((t) => (
                <option key={t} value={t}>{TYPE_META[t].label}</option>
              ))}
            </select>
            <select
              className="fld"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | EventStatus)}
            >
              <option value="all">Сите статуси</option>
              {(Object.keys(STATUS_META) as EventStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
            <Link className="btn btn-gold" href="/venue/events/new">
              <Icon name="plus" size="sm" /> Нов настан
            </Link>
          </div>
        </div>

        <div className="cal-body">
          <div className="cal-main">
            {viewMode === "month" ? (
              <MonthGrid
                cells={monthCells}
                monthDate={miniCalMonth}
                todayIso={todayIso}
                eventsByDate={eventsByDate}
                onSelectDay={(iso) => {
                  setAnchor(new Date(`${iso}T00:00:00`));
                  setViewMode("day");
                }}
              />
            ) : (
              <TimeGrid days={daysInView} todayIso={todayIso} eventsByDate={eventsByDate} rooms={rooms} />
            )}
          </div>

          <div className="cal-side">
            <div className="cal-side-block">
              <div className="mini-cal-nav">
                <button
                  className="sq"
                  type="button"
                  aria-label="Претходен месец"
                  onClick={() => setMiniCalMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                >
                  <Icon name="left" size="sm" />
                </button>
                <div className="mini-cal-jump">
                  <select
                    className="fld cal-jump"
                    aria-label="Оди на месец"
                    value={miniCalMonth.getMonth()}
                    onChange={(e) => setMiniCalMonth(new Date(miniCalMonth.getFullYear(), Number(e.target.value), 1))}
                  >
                    {MK_MONTHS.map((name, i) => (
                      <option key={name} value={i}>{name}</option>
                    ))}
                  </select>
                  <select
                    className="fld cal-jump"
                    aria-label="Оди на година"
                    value={miniCalMonth.getFullYear()}
                    onChange={(e) => setMiniCalMonth(new Date(Number(e.target.value), miniCalMonth.getMonth(), 1))}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <button
                  className="sq"
                  type="button"
                  aria-label="Следен месец"
                  onClick={() => setMiniCalMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                >
                  <Icon name="right" size="sm" />
                </button>
              </div>
              <div className="mini-cal">
                {MK_DAYS_SHORT.map((d) => (
                  <span className="mc-h" key={d}>{d.slice(0, 1)}</span>
                ))}
                {monthCells.map((day, i) => {
                  const iso = day != null
                    ? `${miniCalMonth.getFullYear()}-${String(miniCalMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                    : null;
                  return (
                    <span
                      key={i}
                      className={`mc-d${iso === todayIso ? " is-today" : ""}${day == null ? " is-blank" : ""}`}
                      style={day != null ? { cursor: "pointer" } : undefined}
                      onClick={
                        iso
                          ? () => {
                              setAnchor(new Date(`${iso}T00:00:00`));
                            }
                          : undefined
                      }
                    >
                      {day ?? ""}
                      {iso && eventsByDate.has(iso) ? <i className="mc-dot" /> : null}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="cal-side-block">
              <p className="card-t">Претстојни настани</p>
              {upcomingEvents.length === 0 ? (
                <div className="empty" style={{ padding: "14px 0" }}>Нема претстојни настани.</div>
              ) : (
                upcomingEvents.map((ev) => {
                  const type = TYPE_META[ev.event_type];
                  const d = new Date(`${ev.event_date}T00:00:00`);
                  return (
                    <div className="up-row" key={ev.id}>
                      <span className="up-dot" style={{ background: type.color }} />
                      <span>
                        <b>{formatTimeRange(ev.start_time, ev.end_time) ?? "—"}</b>
                        <span>
                          {type.label} — {ev.couple_names}
                          <br />
                          {d.getDate()} {MK_MONTHS[d.getMonth()]}
                        </span>
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="cal-side-block">
              <p className="card-t">Типови на настани {viewMode === "week" ? "(неделно)" : viewMode === "day" ? "(денес)" : "(месечно)"}</p>
              <TypeDonut counts={typeCounts} total={visibleEvents.length} />
            </div>
          </div>
        </div>
      </section>

      <section className="cal-stats">
        <StatCard icon="cal-dot" label="Настани" sub={viewMode === "week" ? "во неделава" : viewMode === "day" ? "денес" : "во месецов"} value={visibleEvents.length} />
        {Array.from(typeCounts.entries()).map(([type, count]) => (
          <StatCard key={type} icon={TYPE_META[type].icon} label={TYPE_META[type].label} sub="настани" value={count} color={TYPE_META[type].color} />
        ))}
        <StatCard icon="occ" label="Просечна пополнетост" sub="по настан" value={avgOccupancy != null ? `${avgOccupancy}%` : "—"} />
        <StatCard icon="ban" label="Откажани" sub={viewMode === "week" ? "во неделава" : viewMode === "day" ? "денес" : "во месецов"} value={cancelledCount} />
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  sub,
  value,
  color,
}: {
  icon: string;
  label: string;
  sub: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="tile">
      <span className="badge" style={color ? { color, background: `${color}1a` } : undefined}>
        <Icon name={icon} size="lg" />
      </span>
      <div>
        <div className="num">{value}</div>
        <div className="lab">{label}<span>{sub}</span></div>
      </div>
    </div>
  );
}

function MonthGrid({
  cells,
  monthDate,
  todayIso,
  eventsByDate,
  onSelectDay,
}: {
  cells: (number | null)[];
  monthDate: Date;
  todayIso: string;
  eventsByDate: Map<string, EventDetail[]>;
  onSelectDay: (iso: string) => void;
}) {
  return (
    <div className="cal-month-grid">
      {MK_DAYS_SHORT.map((d) => (
        <div className="cal-month-h" key={d}>{d}</div>
      ))}
      {cells.map((day, i) => {
        if (day == null) return <div className="cal-month-cell is-blank" key={i} />;
        const iso = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dayEvents = eventsByDate.get(iso) ?? [];
        const shown = dayEvents.slice(0, 3);
        const overflow = dayEvents.length - shown.length;
        return (
          <div
            key={i}
            className={`cal-month-cell${iso === todayIso ? " is-today" : ""}`}
            onClick={() => onSelectDay(iso)}
          >
            <span className="cal-month-daynum">{day}</span>
            <div className="cal-month-chips">
              {shown.map((ev) => (
                <span key={ev.id} className="cal-month-chip" style={{ background: `${TYPE_META[ev.event_type].color}1f`, color: TYPE_META[ev.event_type].color }}>
                  {ev.couple_names}
                </span>
              ))}
              {overflow > 0 ? <span className="cal-month-more">+{overflow}</span> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TimeGrid({
  days,
  todayIso,
  eventsByDate,
  rooms,
}: {
  days: Date[];
  todayIso: string;
  eventsByDate: Map<string, EventDetail[]>;
  rooms: RoomWithSeatTotal[];
}) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine = nowMinutes >= HOUR_START * 60 && nowMinutes <= HOUR_END * 60;

  return (
    <div className="cal-grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
      <div className="cal-grid-corner" />
      {days.map((d) => {
        const iso = isoOf(d);
        return (
          <div className={`cal-day-head${iso === todayIso ? " is-today" : ""}`} key={iso}>
            <span className="cal-day-name">{MK_DAYS_LONG[(d.getDay() + 6) % 7].slice(0, 3)}</span>
            <span className="cal-day-num">{d.getDate()} {MK_MONTHS[d.getMonth()].slice(0, 3)}</span>
          </div>
        );
      })}

      <div className="cal-gutter" style={{ height: GRID_HEIGHT }}>
        {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
          <div className="cal-hour-label" key={i} style={{ top: i * ROW_HEIGHT }}>
            {String(HOUR_START + i).padStart(2, "0")}:00
          </div>
        ))}
      </div>

      {days.map((d) => {
        const iso = isoOf(d);
        const dayEvents = eventsByDate.get(iso) ?? [];
        return (
          <div className="cal-day-col" key={iso} style={{ height: GRID_HEIGHT }}>
            {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
              <div className="cal-hour-line" key={i} style={{ top: i * ROW_HEIGHT }} />
            ))}
            {iso === todayIso && showNowLine ? (
              <div
                className="cal-now-line"
                style={{ top: ((nowMinutes - HOUR_START * 60) / 60) * ROW_HEIGHT }}
              />
            ) : null}
            {dayEvents.map((ev) => {
              const type = TYPE_META[ev.event_type];
              const startMin = ev.start_time ? timeToMinutes(ev.start_time) : HOUR_START * 60;
              const endMin = ev.end_time ? timeToMinutes(ev.end_time) : startMin + 60;
              const top = Math.max(0, ((startMin - HOUR_START * 60) / 60) * ROW_HEIGHT);
              const height = Math.max(24, ((endMin - startMin) / 60) * ROW_HEIGHT);
              const roomNames = ev.room_ids.map((id) => rooms.find((r) => r.id === id)?.name).filter(Boolean).join(", ");
              return (
                <Link
                  href={`/venue/events/${ev.id}`}
                  key={ev.id}
                  className="cal-event"
                  style={{ top, height, background: `${type.color}22`, borderLeftColor: type.color, color: type.color }}
                >
                  <b>{formatTimeRange(ev.start_time, ev.end_time) ?? "Без време"}</b>
                  <span>{ev.couple_names}</span>
                  {height > 46 ? <span className="cal-event-sub">{[roomNames, ev.guest_count_estimate != null ? `${ev.guest_count_estimate} гости` : null].filter(Boolean).join(" · ")}</span> : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function TypeDonut({ counts, total }: { counts: Map<EventType, number>; total: number }) {
  const types = (Object.keys(TYPE_META) as EventType[]).filter((t) => (counts.get(t) ?? 0) > 0);
  const R = 15.9155;
  let offset = 0;

  return (
    <div className="cal-donut-wrap">
      <svg viewBox="0 0 36 36" className="cal-donut">
        <circle cx="18" cy="18" r={R} fill="none" stroke="var(--line)" strokeWidth="4" />
        {total > 0
          ? types.map((t) => {
              const count = counts.get(t) ?? 0;
              const pct = (count / total) * 100;
              const circle = (
                <circle
                  key={t}
                  cx="18"
                  cy="18"
                  r={R}
                  fill="none"
                  stroke={TYPE_META[t].color}
                  strokeWidth="4"
                  strokeDasharray={`${pct} ${100 - pct}`}
                  strokeDashoffset={25 - offset}
                  strokeLinecap="butt"
                />
              );
              offset += pct;
              return circle;
            })
          : null}
        <text x="18" y="16.5" textAnchor="middle" className="cal-donut-total">{total}</text>
        <text x="18" y="22.5" textAnchor="middle" className="cal-donut-label">настани</text>
      </svg>
      <div className="cal-donut-legend">
        {types.length === 0 ? (
          <span className="muted">Нема настани во периодов.</span>
        ) : (
          types.map((t) => (
            <span key={t} className="cal-donut-legend-row">
              <i style={{ background: TYPE_META[t].color }} />
              {TYPE_META[t].label}
              <b>{Math.round(((counts.get(t) ?? 0) / total) * 100)}%</b>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
