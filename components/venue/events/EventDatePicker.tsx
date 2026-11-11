"use client";

import { useEffect, useState } from "react";
import { buildMonthGrid, monthOf, shiftMonth, monthLabel, WEEKDAY_LABELS } from "@/lib/venue/calendar-grid";
import { roomColor } from "@/lib/venue/calendar-colors";
import { todayIn } from "@/lib/date";
import { Icon } from "@/components/venue/shell/Icon";

const RING_WIDTH_PX = 2;
const RING_GAP_PX = 1;

/** The concentric box-shadow ring(s) for a date already booked in one or
 * more rooms — one ring per room, each in that room's own color, so two
 * rooms booked the same day show as two nested rings around the number
 * instead of just one flat "busy" indicator. */
function ringStyle(colors: string[]): React.CSSProperties | undefined {
  if (colors.length === 0) return undefined;
  const shadows = colors.map((color, i) => {
    const offset = RING_GAP_PX + i * (RING_WIDTH_PX + RING_GAP_PX);
    return `0 0 0 ${offset}px ${color}`;
  });
  return { boxShadow: shadows.join(", ") };
}

/**
 * A visual month-grid alongside the wizard's native date field (kept as the
 * primary, typeable, accessible control). Every room with a full-capacity
 * event on a date gets its own colored ring around that date's number —
 * two rooms booked the same day draw as two nested rings — with a legend
 * below naming each color's room. Rooms come after the date in the wizard,
 * so this shows the whole venue's bookings, not just an already-picked
 * room's; still purely advisory, never a block (two events can share a
 * hall on purpose).
 */
export function EventDatePicker({
  value,
  onChange,
  rooms,
  bookedDatesByRoom,
  eventCountsByDate = {},
  onMonthChange,
}: {
  value: string;
  onChange: (date: string) => void;
  /** The venue's rooms, in a stable order — also used to assign each room's ring color. */
  rooms: { id: string; name: string }[];
  /** roomId -> booked ISO dates, for the calendar's currently visible month. */
  bookedDatesByRoom: Record<string, string[]>;
  /** date -> how many events the venue already has that day: one dot per event under the number. */
  eventCountsByDate?: Record<string, number>;
  /** Fires on mount and whenever the visible month changes, so the parent can fetch that month's booked dates. */
  onMonthChange: (year: number, month: number) => void;
}) {
  const today = todayIn();
  const [[year, month], setYearMonth] = useState<[number, number]>(() => monthOf(value, today));

  useEffect(() => {
    onMonthChange(year, month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const roomIds = rooms.map((r) => r.id);
  const cells = buildMonthGrid(year, month);
  const legendRooms = rooms.filter((r) => (bookedDatesByRoom[r.id]?.length ?? 0) > 0);

  function bookedRoomsFor(date: string): { id: string; name: string }[] {
    return rooms.filter((r) => bookedDatesByRoom[r.id]?.includes(date));
  }

  return (
    <div className="ev-cal">
      <div className="ev-cal-nav">
        <button type="button" className="btn btn-ghost" aria-label="Претходен месец" onClick={() => setYearMonth(shiftMonth(year, month, -1))}>
          <Icon name="left" size="sm" />
        </button>
        <span className="ev-cal-month">{monthLabel(year, month)}</span>
        <button type="button" className="btn btn-ghost" aria-label="Следен месец" onClick={() => setYearMonth(shiftMonth(year, month, 1))}>
          <Icon name="right" size="sm" />
        </button>
      </div>
      <div className="ev-cal-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="ev-cal-grid" role="group" aria-label="Календар">
        {cells.map((cell, i) => {
          if (!cell.date) return <span key={`blank-${i}`} className="ev-cal-day empty" aria-hidden="true" />;
          const date = cell.date;
          const bookedRooms = bookedRoomsFor(date);
          const colors = bookedRooms.map((r) => roomColor(r.id, roomIds));
          const eventCount = eventCountsByDate[date] ?? 0;
          const titleParts = [
            eventCount > 0 ? (eventCount === 1 ? "1 настан" : `${eventCount} настани`) : null,
            bookedRooms.length > 0 ? `Веќе зафатено: ${bookedRooms.map((r) => r.name).join(", ")}` : null,
          ].filter(Boolean);
          return (
            <button
              key={date}
              type="button"
              className={["ev-cal-day", date === value ? "selected" : "", date === today ? "today" : ""].filter(Boolean).join(" ")}
              style={ringStyle(colors)}
              aria-pressed={date === value}
              title={titleParts.length > 0 ? titleParts.join(" · ") : undefined}
              onClick={() => onChange(date)}
            >
              {Number(date.slice(-2))}
              {eventCount > 0 ? (
                <span className={`ev-cal-dots${eventCount > 1 ? " is-multi" : ""}`} aria-label={eventCount === 1 ? "1 настан" : `${eventCount} настани`}>
                  {Array.from({ length: Math.min(eventCount, 3) }, (_, k) => (
                    <i key={k} />
                  ))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {legendRooms.length > 0 ? (
        <div className="ev-cal-legend">
          {legendRooms.map((r) => (
            <span key={r.id} className="ev-cal-legend-item">
              <span className="ev-cal-legend-dot" style={{ background: roomColor(r.id, roomIds) }} aria-hidden="true" />
              {r.name}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
