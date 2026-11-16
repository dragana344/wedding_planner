"use client";

import { useState } from "react";
import { formatMkDate } from "@/lib/date";

export type ThreadEntry = { id: string; mine: boolean; author: string; body: string; createdAt: string };

function time(iso: string): string {
  return new Intl.DateTimeFormat("mk-MK", { timeZone: "Europe/Skopje", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** A conversation as chat bubbles — the support thread (requester ↔ team)
 * and the admin-task comments both render through this. `mine` puts a
 * message on the right, in gold. */
export function ThreadMessages({ entries, empty }: { entries: ThreadEntry[]; empty: string }) {
  if (entries.length === 0) return <p className="sp-thread-empty">{empty}</p>;
  return (
    <ol className="sp-thread">
      {entries.map((e) => (
        <li key={e.id} className={`sp-msg${e.mine ? " is-mine" : ""}`}>
          <div className="sp-msg-meta">
            <strong>{e.author}</strong> · {formatMkDate(e.createdAt.slice(0, 10))} {time(e.createdAt)}
          </div>
          <div className="sp-msg-body">{e.body}</div>
        </li>
      ))}
    </ol>
  );
}

/** Textarea + send button under a thread. Clears itself once onSend resolves true. */
export function ThreadReplyForm({
  id,
  label,
  placeholder,
  submitLabel = "Испрати",
  onSend,
}: {
  id: string;
  label: string;
  placeholder?: string;
  submitLabel?: string;
  onSend: (body: string) => Promise<boolean>;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      if (await onSend(body.trim())) setBody("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="sp-reply" onSubmit={submit}>
      <label className="lab-s" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="fld"
        rows={3}
        maxLength={5000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        disabled={busy}
      />
      <button type="submit" className="btn btn-gold" disabled={busy || !body.trim()}>
        {busy ? "Се испраќа..." : submitLabel}
      </button>
    </form>
  );
}
