"use client";

import { useState, useTransition } from "react";
import type { SupportTicketRow } from "@/lib/admin/queries";
import { todayIn } from "@/lib/date";
import { setSupportTicketStatus } from "@/app/admin/(panel)/support/actions";

const STATUS_LABEL: Record<SupportTicketRow["status"], string> = { pending: "Во очекување", done: "Завршено" };
const STATUS_VARIANT: Record<SupportTicketRow["status"], string> = { pending: "p-warn", done: "p-ok" };
const SUBMITTED_BY_LABEL: Record<SupportTicketRow["submittedBy"], string> = { venue: "локал", couple: "пар" };

export function SupportTicketsTable({ tickets }: { tickets: SupportTicketRow[] }) {
  return (
    <table className="s1-tbl">
      <thead>
        <tr>
          <th>Датум</th>
          <th>Од</th>
          <th>Локал</th>
          <th>Проблем</th>
          <th>Опис</th>
          <th>Статус</th>
          <th>Коментар</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {tickets.map((t) => (
          <TicketRow key={t.id} ticket={t} />
        ))}
      </tbody>
    </table>
  );
}

function TicketRow({ ticket }: { ticket: SupportTicketRow }) {
  const [comment, setComment] = useState(ticket.adminComment ?? "");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function save(status: SupportTicketRow["status"]) {
    start(async () => {
      const result = await setSupportTicketStatus({ id: ticket.id, status, adminComment: comment.trim() || undefined });
      setMessage(result.ok ? null : result.error);
    });
  }

  return (
    <tr>
      <td>{todayIn(undefined, new Date(ticket.createdAt))}</td>
      <td>
        {SUBMITTED_BY_LABEL[ticket.submittedBy]}
        {ticket.coupleNames ? ` · ${ticket.coupleNames}` : ""}
      </td>
      <td>{ticket.venueName}</td>
      <td>{ticket.problem}</td>
      <td style={{ maxWidth: 280, whiteSpace: "pre-wrap" }}>{ticket.description}</td>
      <td>
        <span className={`pill ${STATUS_VARIANT[ticket.status]}`}>{STATUS_LABEL[ticket.status]}</span>
      </td>
      <td style={{ minWidth: 180 }}>
        <textarea
          className="fld"
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Коментар до тимот (по желба)"
          aria-label={`Коментар за барањето од ${ticket.name}`}
          disabled={pending}
        />
        {message ? (
          <p role="alert" style={{ color: "var(--bad)", fontSize: 12.5, margin: "4px 0 0" }}>
            {message}
          </p>
        ) : null}
      </td>
      <td>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ticket.status !== "done" ? (
            <button type="button" className="btn btn-gold" disabled={pending} onClick={() => save("done")}>
              Заврши
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => save("pending")}>
              Врати во очекување
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
