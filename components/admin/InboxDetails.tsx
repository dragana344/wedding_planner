"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InboxTicket, InboxTicketMessage, MessageRow } from "@/lib/admin/queries";
import { deleteMessage, replyToTicket, setMessageStatus, setTicketStatus } from "@/app/admin/(panel)/messages/actions";
import { ThreadMessages, ThreadReplyForm } from "@/components/support/ThreadMessages";
import { StatusButtons } from "./StatusButtons";

/** Status + delete for a public contact message. The sender has no account,
 * so the answer goes out by e-mail; the status records that it was handled. */
export function ContactMessageActions({ message }: { message: MessageRow }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <StatusButtons status={message.status} onChange={(status) => setMessageStatus({ id: message.id, status })} />
      <button
        type="button"
        className="btn btn-ghost"
        onClick={async () => {
          if (!window.confirm("Да се избрише пораката?")) return;
          const r = await deleteMessage({ id: message.id });
          if (r.ok) router.push("/admin/messages");
          else setError(r.error);
        }}
      >
        Избриши
      </button>
      {error ? (
        <span role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** A venue/couple ticket's conversation, from the team's side. */
export function AdminTicketThread({ ticket, messages }: { ticket: InboxTicket; messages: InboxTicketMessage[] }) {
  const [error, setError] = useState<string | null>(null);
  const entries = [
    { id: `${ticket.id}-desc`, mine: false, author: ticket.name, body: ticket.description, createdAt: ticket.createdAt },
    ...messages.map((m) => ({
      id: m.id,
      mine: m.author === "admin",
      author: m.author === "admin" ? (m.adminEmail ?? "Тим за поддршка") : ticket.name,
      body: m.body,
      createdAt: m.createdAt,
    })),
  ];

  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <StatusButtons status={ticket.status} onChange={(status) => setTicketStatus({ id: ticket.id, status })} />
        <ThreadMessages entries={entries} empty="" />
        {error ? (
          <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>
            {error}
          </p>
        ) : null}
        <ThreadReplyForm
          id="admin-ticket-reply"
          label="Одговор"
          placeholder={ticket.submittedBy === "couple" ? "Одговор до парот..." : "Одговор до локалот..."}
          submitLabel="Испрати одговор"
          onSend={async (body) => {
            const r = await replyToTicket({ id: ticket.id, body });
            setError(r.ok ? null : r.error);
            return r.ok;
          }}
        />
    </div>
  );
}
