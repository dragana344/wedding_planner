"use client";

import { useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/venue/shell/Icon";
import { Modal } from "@/components/venue/dashboard/Modal";

/**
 * A ▾ arrow that opens a scrollable popup with a from/to date-range picker.
 * Used next to a panel title (admin overview, venue notifications) — render
 * it directly beside the <h2>, not at the far end of a space-between row,
 * so the arrow reads as "more options for this title" rather than an
 * unrelated action floating on the other side of the panel.
 *
 * The form has no onSubmit — it's a plain GET to the current page (same
 * convention as the Audit log and Messages filters), so picking a range is
 * a normal server round trip, not client-side fetching. `isOpen` comes from
 * the server already knowing (from searchParams) whether a range is
 * active, so a page reload after submitting the form reopens this popup
 * pre-filled with its result instead of losing it behind the arrow again.
 */
export function RangePanel({
  title,
  fromName,
  toName,
  defaultFrom,
  defaultTo,
  isOpen,
  resetHref,
  resetLabel,
  children,
}: {
  title: string;
  fromName: string;
  toName: string;
  defaultFrom?: string;
  defaultTo?: string;
  isOpen: boolean;
  resetHref: string;
  resetLabel: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(isOpen);

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "4px 8px" }}
        aria-label={`Избери период за: ${title}`}
        onClick={() => setOpen(true)}
      >
        <Icon name="down" size="sm" />
      </button>
      {open ? (
        <Modal title={title} onClose={() => setOpen(false)}>
          <form className="bar" aria-label={`Период за ${title}`}>
            <div>
              <label className="lab-s" htmlFor={`${fromName}-input`}>
                Од датум
              </label>
              <input id={`${fromName}-input`} type="date" className="fld" name={fromName} defaultValue={defaultFrom} required />
            </div>
            <div>
              <label className="lab-s" htmlFor={`${toName}-input`}>
                До датум
              </label>
              <input id={`${toName}-input`} type="date" className="fld" name={toName} defaultValue={defaultTo} />
            </div>
            <button className="btn btn-gold" type="submit">
              Прикажи
            </button>
            {isOpen ? (
              <Link className="btn btn-ghost" href={resetHref}>
                {resetLabel}
              </Link>
            ) : null}
          </form>
          <div style={{ maxHeight: "55vh", overflowY: "auto", marginTop: 16 }}>{children}</div>
        </Modal>
      ) : null}
    </>
  );
}
