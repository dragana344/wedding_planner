"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SeenSection } from "@/lib/changes/types";

/** What the venue changed (or entered) in one section; any organizer confirms it with Видено. */
export function ChangeNotice({
  section,
  title,
  lines,
  upTo,
}: {
  section: SeenSection;
  title: string;
  lines: { key: string; text: string }[];
  /** The newest shown change's time, unchanged, so one that arrives meanwhile stays unseen. */
  upTo: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newer, setNewer] = useState(false);

  async function handleSeen() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/couple/changes/seen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section, up_to: upTo }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; newer?: boolean };
      if (!res.ok) throw new Error(data.error ?? "Не успеа означувањето како видено.");
      setNewer(data.newer === true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не успеа означувањето како видено.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="change-box" role="region" aria-label={title} style={{ marginBottom: 16 }}>
      <b className="change-box-label">{title}</b>
      {lines.map((l) => (
        <div key={l.key}>{l.text}</div>
      ))}
      {newer ? <p role="status" className="change-box-note">Има нови промени — освежете.</p> : null}
      {error ? (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: "6px 0 0" }}>
          {error}
        </p>
      ) : null}
      <button type="button" className="btn btn-gold" style={{ marginTop: 8 }} onClick={() => void handleSeen()} disabled={busy}>
        Видено
      </button>
    </section>
  );
}
