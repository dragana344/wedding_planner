"use client";

import { useEffect, useState } from "react";
import type { SupportTicket, TicketMessage } from "@/lib/venue/support";
import { ThreadMessages, ThreadReplyForm } from "./ThreadMessages";

const LOAD_ERROR = "Разговорот не можеше да се вчита.";
const SEND_ERROR = "Пораката не се испрати. Обидете се повторно.";

/** One ticket's conversation with the team, loaded on open from
 * `${endpoint}/${id}` (which also clears its "new reply" marker). The
 * ticket's own description is the conversation's first message. */
export function SupportTicketThread({
  endpoint,
  ticket,
  onTicketChange,
}: {
  endpoint: string;
  ticket: SupportTicket;
  onTicketChange: (ticket: SupportTicket) => void;
}) {
  const [messages, setMessages] = useState<TicketMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${endpoint}/${ticket.id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data) {
          setError(data?.error ?? LOAD_ERROR);
          return;
        }
        setMessages(data.messages as TicketMessage[]);
        onTicketChange(data.ticket as SupportTicket);
      })
      .catch(() => {
        if (!cancelled) setError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, ticket.id]);

  async function send(body: string): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch(`${endpoint}/${ticket.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? SEND_ERROR);
        return false;
      }
      setMessages((m) => [...(m ?? []), data.message as TicketMessage]);
      onTicketChange(data.ticket as SupportTicket);
      return true;
    } catch {
      setError(SEND_ERROR);
      return false;
    }
  }

  const entries = [
    { id: `${ticket.id}-desc`, mine: true, author: ticket.name, body: ticket.description, createdAt: ticket.createdAt },
    ...(messages ?? []).map((m) => ({
      id: m.id,
      mine: m.author === "requester",
      author: m.author === "admin" ? "Тим за поддршка" : "Вие",
      body: m.body,
      createdAt: m.createdAt,
    })),
  ];

  return (
    <div className="sp-ticket">
      {messages === null && !error ? <p className="muted">Се вчитува...</p> : <ThreadMessages entries={entries} empty="" />}
      {error ? (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>
          {error}
        </p>
      ) : null}
      {messages !== null ? (
        <ThreadReplyForm
          id={`support-reply-${ticket.id}`}
          label="Ваш одговор"
          placeholder={ticket.status === "done" ? "Барањето е решено — ако пишете, повторно ќе се отвори." : "Напишете порака до тимот..."}
          onSend={send}
        />
      ) : null}
    </div>
  );
}
