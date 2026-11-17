"use client";

import { useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";

/** On phones, folds a long filter form behind a "Филтри" button (open when a
 * filter is already applied). Above 760px the button is hidden and the form
 * always shows. */
export function FilterBar({ activeCount, children }: { activeCount: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(activeCount > 0);
  return (
    <div className={`fbar${open ? " is-open" : ""}`}>
      <button type="button" className="btn btn-ghost fbar-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="filter" size="sm" />
        Филтри
        {activeCount > 0 ? <span className="fbar-count">{activeCount}</span> : null}
        <Icon name="down" size="sm" className="fbar-chev" />
      </button>
      {children}
    </div>
  );
}
