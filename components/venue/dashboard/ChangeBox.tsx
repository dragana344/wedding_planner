"use client";

import { useState } from "react";
import { describeChange, formatChangedAt } from "@/lib/changes/format";
import { sideName } from "@/lib/changes/rules";
import type { EventChange } from "@/lib/changes/types";
import { markChangesSeenViaApi } from "@/lib/venue/changes-client";
import { errorMessage } from "@/lib/venue/user-error";

/** The couple's unseen changes in one section; a manager confirms them with Видено. */
export function ChangeBox({
  eventId,
  section,
  changes,
  canConfirm,
  token,
  onSeen,
}: {
  eventId: string;
  section: "guest_count" | "contact";
  changes: EventChange[];
  canConfirm: boolean;
  token: string | null;
  /** Called after Видено went through, or when newer changes arrived: the screen should reload. */
  onSeen: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newer, setNewer] = useState(false);
  if (changes.length === 0) return null;

  async function handleSeen() {
    // The newest change this box shows, so one that arrives meanwhile stays unseen.
    const upTo = changes.reduce((a, c) => (Date.parse(c.changedAt) > Date.parse(a.changedAt) ? c : a)).changedAt;
    setBusy(true);
    setError("");
    try {
      const result = await markChangesSeenViaApi(eventId, section, upTo, token);
      setNewer(result.newer);
      onSeen();
    } catch (err) {
      setError(errorMessage(err, "Не успеа означувањето како видено."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="change-box">
      <b className="change-box-label">Променето</b>
      {changes.map((c) => {
        const redactPrivate = c.oldValue === null && c.newValue === null && (c.section === "contact" || c.section === "finance");
        return (
          <div key={c.id}>
            {sideName(c.side, c.changedBy)} · {formatChangedAt(c.changedAt)} · {describeChange(c, { redactPrivate })}
          </div>
        );
      })}
      {newer ? <p role="status" className="change-box-note">Има нови промени — освежете.</p> : null}
      {error ? (
        <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: "6px 0 0" }}>
          {error}
        </p>
      ) : null}
      {canConfirm ? (
        <button type="button" className="btn btn-gold" style={{ marginTop: 8 }} onClick={handleSeen} disabled={busy}>
          Видено
        </button>
      ) : null}
    </div>
  );
}
