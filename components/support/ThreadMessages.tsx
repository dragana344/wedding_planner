"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMkDate } from "@/lib/date";

export type ThreadAttachment = { path: string; url: string };
export type ThreadEntry = {
  id: string;
  mine: boolean;
  author: string;
  body: string;
  createdAt: string;
  /** Photos/PDFs on this message (admin-task comments only, 0153 — the
   * support thread between venues/couples and the team has none). */
  attachments?: ThreadAttachment[];
};

function time(iso: string): string {
  return new Intl.DateTimeFormat("mk-MK", { timeZone: "Europe/Skopje", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

const isImage = (path: string) => /\.(jpg|jpeg|png|webp)$/i.test(path);

export function Attachments({ items }: { items: ThreadAttachment[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="sp-msg-attachments" style={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 8, margin: "8px 0 0", padding: 0 }}>
      {items.map((a) => (
        <li key={a.path}>
          <a href={a.url} target="_blank" rel="noreferrer">
            {isImage(a.path) ? (
              // eslint-disable-next-line @next/next/no-img-element -- a signed Storage URL, not an optimizable local/remote asset
              <img src={a.url} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, display: "block" }} />
            ) : (
              <span className="btn btn-ghost" style={{ display: "inline-block" }}>
                PDF
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
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
          {e.attachments ? <Attachments items={e.attachments} /> : null}
        </li>
      ))}
    </ol>
  );
}

/** Textarea + send button under a thread. Clears itself once onSend resolves true.
 * `allowFiles` adds a photo/PDF picker (admin-task comments only, 0153). */
export function ThreadReplyForm({
  id,
  label,
  placeholder,
  submitLabel = "Испрати",
  allowFiles = false,
  onSend,
}: {
  id: string;
  label: string;
  placeholder?: string;
  submitLabel?: string;
  allowFiles?: boolean;
  onSend: (body: string, files: File[]) => Promise<boolean>;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      if (await onSend(body.trim(), files)) {
        setBody("");
        setFiles([]);
        // onSend's own revalidatePath() only refreshes the route the next
        // time it's visited — without this, the new message/attachment
        // doesn't show up until a manual reload.
        router.refresh();
      }
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
      {allowFiles ? (
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          aria-label="Прилози (фотографии или PDF)"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          disabled={busy}
        />
      ) : null}
      <button type="submit" className="btn btn-gold" disabled={busy || !body.trim()}>
        {busy ? "Се испраќа..." : submitLabel}
      </button>
    </form>
  );
}
