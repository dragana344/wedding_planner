"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/admin/actions";
import type { SupportStatus } from "@/lib/support/status";

/** Во тек / Решено / reopen for anything on the new → in_progress → done
 * track (inbox messages, tickets, admin tasks). Shows only the moves that
 * make sense from the current status. */
export function StatusButtons({
  status,
  onChange,
}: {
  status: SupportStatus;
  onChange: (status: SupportStatus) => Promise<ActionResult<unknown>>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(next: SupportStatus) {
    start(async () => {
      const r = await onChange(next);
      setError(r.ok ? null : r.error);
    });
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {status === "new" ? (
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => set("in_progress")}>
          Во тек
        </button>
      ) : null}
      {status !== "done" ? (
        <button type="button" className="btn btn-gold" disabled={pending} onClick={() => set("done")}>
          Решено
        </button>
      ) : (
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={() => set("in_progress")}>
          Отвори повторно
        </button>
      )}
      {error ? (
        <span role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
