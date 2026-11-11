"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";

export interface ToolbarMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Draws a thin rule above this item. */
  separated?: boolean;
}

/**
 * A toolbar button that drops down a short list of actions (the couple's
 * seating toolbar: "Додај елемент", "Тип на маса", "Повеќе"). Closes on a
 * pick, Escape or a click anywhere else.
 */
export function ToolbarMenu({
  label,
  icon,
  items,
  primary = false,
  disabled = false,
}: {
  label: string;
  icon: string;
  items: ToolbarMenuItem[];
  primary?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="cs-menu">
      <button
        type="button"
        className={`cs-btn${primary ? " cs-btn-primary" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || items.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={icon} size="sm" />
        {label}
        <Icon name="down" size="sm" className="cs-btn-caret" />
      </button>
      {open ? (
        <ul role="menu" aria-label={label} className="cs-menu-list">
          {items.map((item) => (
            <li key={item.key} role="none" className={item.separated ? "cs-menu-sep" : undefined}>
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
