"use client";

import { useCallback, useRef } from "react";
import type { HourOccupancy } from "@/lib/venue/occupancy";

const FREE_RGB = [22, 163, 74] as const; // --free
const BUSY_RGB = [220, 38, 38] as const; // matches the floor plan's "reserved" red

/** Green at 0% full, red at 100% full, interpolated linearly. */
export function occupancyColor(pct: number): string {
  const t = Math.min(100, Math.max(0, pct)) / 100;
  const [r, g, b] = FREE_RGB.map((start, i) => Math.round(start + (BUSY_RGB[i] - start) * t));
  return `rgb(${r}, ${g}, ${b})`;
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function HourOccupancySlider({
  hours,
  activeHour,
  onHourChange,
}: {
  hours: HourOccupancy[];
  activeHour: number;
  onHourChange: (hour: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const hourFromClientX = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return activeHour;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.min(23, Math.floor(ratio * 24));
  }, [activeHour]);

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    onHourChange(hourFromClientX(e.clientX));
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.buttons !== 1) return;
    onHourChange(hourFromClientX(e.clientX));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onHourChange(Math.max(0, activeHour - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onHourChange(Math.min(23, activeHour + 1));
    }
  }

  return (
    <div className="hour-slider">
      <div
        ref={trackRef}
        className="hour-slider-track"
        role="slider"
        tabIndex={0}
        aria-label="Час од денот"
        aria-valuemin={0}
        aria-valuemax={23}
        aria-valuenow={activeHour}
        aria-valuetext={hourLabel(activeHour)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onKeyDown={handleKeyDown}
      >
        {hours.map((h) => (
          <button
            key={h.hour}
            type="button"
            className="hour-slider-seg"
            aria-pressed={h.hour === activeHour}
            onClick={() => onHourChange(h.hour)}
          >
            <span className="hour-slider-bar" style={{ background: occupancyColor(h.pct) }} />
            <span className="hour-slider-pct">{h.pct}%</span>
            <span className="hour-slider-hour">{h.hour}ч</span>
          </button>
        ))}
        <div
          className="hour-slider-thumb"
          style={{ left: `${((activeHour + 0.5) / 24) * 100}%` }}
          aria-hidden
        />
      </div>
    </div>
  );
}
