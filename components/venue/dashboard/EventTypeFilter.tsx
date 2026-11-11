"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import { TYPE_META } from "@/lib/venue/event-display";
import type { EventType } from "@/lib/venue/events";

export type TypeFilterValue = "all" | EventType;

const GROUPS: { title: string; types: EventType[] }[] = [
  {
    title: "Приватни",
    types: ["wedding", "birthday", "baptism", "graduation", "anniversary", "family", "new_year", "school", "baby_shower"],
  },
  { title: "Деловни", types: ["corporate", "conference", "presentation", "seminar", "team_building"] },
  { title: "Останато", types: ["other"] },
];

/** Shown as quick chips when nothing has been booked yet. */
const DEFAULT_QUICK: EventType[] = ["wedding", "birthday", "corporate"];
const QUICK_COUNT = 3;

/**
 * "Сите" plus the venue's most-booked types as quick chips; every type sits
 * in the "Повеќе" dropdown, grouped, with its count. A type picked from the
 * dropdown shows up as its own active chip (× clears it back to Сите).
 */
export function EventTypeFilter({
  value,
  counts,
  total,
  onChange,
}: {
  value: TypeFilterValue;
  counts: Record<EventType, number>;
  total: number;
  onChange: (value: TypeFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const used = (Object.keys(TYPE_META) as EventType[])
    .filter((t) => counts[t] > 0)
    .sort((a, b) => counts[b] - counts[a]);
  const quick = (used.length > 0 ? used : DEFAULT_QUICK).slice(0, QUICK_COUNT);
  const pickedOutside = value !== "all" && !quick.includes(value) ? value : null;

  function pick(next: TypeFilterValue) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div className="chips tf" role="group" aria-label="Филтри по вид" ref={rootRef}>
      <button className="chip" type="button" aria-pressed={value === "all"} onClick={() => onChange("all")}>
        Сите <span className="tf-count">{total}</span>
      </button>
      {quick.map((type) => (
        <button key={type} className="chip tf-chip" type="button" aria-pressed={value === type} onClick={() => onChange(type)}>
          <Icon name={TYPE_META[type].icon} size="sm" />
          {TYPE_META[type].label} <span className="tf-count">{counts[type]}</span>
        </button>
      ))}
      {pickedOutside ? (
        <span className="tf-picked">
          <button className="chip tf-chip" type="button" aria-pressed onClick={() => setOpen(true)}>
            <Icon name={TYPE_META[pickedOutside].icon} size="sm" />
            {TYPE_META[pickedOutside].label} <span className="tf-count">{counts[pickedOutside]}</span>
          </button>
          <button className="tf-clear" type="button" aria-label="Исчисти филтер" onClick={() => onChange("all")}>
            <Icon name="x" size="sm" />
          </button>
        </span>
      ) : null}
      <div className="tf-more">
        <button className="chip tf-chip" type="button" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          Повеќе видови <Icon name="down" size="sm" className={open ? "tf-caret open" : "tf-caret"} />
        </button>
        {open ? (
          <div className="tf-pop" role="menu" aria-label="Сите видови настани">
            {GROUPS.map((group) => (
              <div key={group.title} className="tf-group">
                <div className="tf-group-title">{group.title}</div>
                <div className="tf-grid">
                  {group.types.map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="menuitemradio"
                      aria-checked={value === type}
                      className={`tf-opt${value === type ? " on" : ""}${counts[type] === 0 ? " is-zero" : ""}`}
                      onClick={() => pick(type)}
                    >
                      <span className="tf-ic" style={{ color: TYPE_META[type].color, background: `${TYPE_META[type].color}14` }}>
                        <Icon name={TYPE_META[type].icon} size="sm" />
                      </span>
                      <span className="tf-label">{TYPE_META[type].label}</span>
                      <span className="tf-count">{counts[type]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
