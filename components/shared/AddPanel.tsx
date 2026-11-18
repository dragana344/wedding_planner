"use client";

import { useId, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import { useReadOnly } from "@/components/shared/ReadOnlyContext";

/** "+ ДОДАДИ …" card: a collapsed header that opens the add form beneath it,
 * so long forms don't push the page's real content off a phone screen. */
export function AddPanel({
  title,
  defaultOpen = false,
  className = "",
  ignoreReadOnly = false,
  children,
}: {
  title: string;
  /** Open on first render — e.g. when the list is still empty. */
  defaultOpen?: boolean;
  className?: string;
  /** Stay available in a read-only panel (e.g. reporting a problem). */
  ignoreReadOnly?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  // Nothing to add in a read-only panel (the couple's period after the event).
  if (useReadOnly() && !ignoreReadOnly) return null;
  return (
    <section className={`addp${open ? " is-open" : ""} ${className}`.trim()}>
      <h2 className="addp-h">
        <button type="button" className="addp-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
          <Icon name="plus" size="sm" />
          <span>{title}</span>
          <Icon name="down" size="sm" className="addp-chev" />
        </button>
      </h2>
      {open ? (
        <div id={bodyId} className="addp-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}
