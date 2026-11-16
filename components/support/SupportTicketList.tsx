"use client";

import { Fragment, useState } from "react";
import type { SupportTicket } from "@/lib/venue/support";
import { formatMkDate } from "@/lib/date";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_PILL } from "@/lib/support/status";
import { SupportTicketThread } from "./SupportTicketThread";

/** Shared by the venue and couple dashboards: the caller's own tickets, each
 * opening into its conversation with the team. */
export function SupportTicketList({
  endpoint,
  tickets,
  onTicketChange,
}: {
  endpoint: string;
  tickets: SupportTicket[];
  onTicketChange: (ticket: SupportTicket) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (tickets.length === 0) return <p className="s1-empty">Нема испратени барања.</p>;
  return (
    <table className="s1-tbl">
      <thead>
        <tr>
          <th>Датум</th>
          <th>Проблем</th>
          <th>Статус</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {tickets.map((t) => {
          const open = openId === t.id;
          return (
            <Fragment key={t.id}>
              <tr>
                <td>{formatMkDate(t.createdAt.slice(0, 10))}</td>
                <td>
                  {t.problem}
                  {t.requesterUnread ? <span className="pill p-bad" style={{ marginLeft: 8 }}>Нов одговор</span> : null}
                </td>
                <td>
                  <span className={`pill ${SUPPORT_STATUS_PILL[t.status]}`}>{SUPPORT_STATUS_LABEL[t.status]}</span>
                </td>
                <td style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-expanded={open}
                    aria-label={`${open ? "Затвори" : "Отвори"} разговор: ${t.problem}`}
                    onClick={() => setOpenId(open ? null : t.id)}
                  >
                    {open ? "Затвори" : "Разговор"}
                  </button>
                </td>
              </tr>
              {open ? (
                <tr>
                  <td colSpan={4}>
                    <SupportTicketThread endpoint={endpoint} ticket={t} onTicketChange={onTicketChange} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
