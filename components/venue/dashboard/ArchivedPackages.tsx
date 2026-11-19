"use client";

import { useCallback, useEffect, useState } from "react";
import { listArchivedMenuTemplates, restoreMenuTemplate } from "@/lib/venue/menus";
import { formatVenueDatePadded } from "@/lib/date";
import { errorMessage } from "@/lib/venue/user-error";

/**
 * Packages taken off the list while events still used them (0181), with
 * "Врати" to offer them for new events again. Hidden while there are none.
 */
export function ArchivedPackages({ venueId, refreshKey, onRestored }: { venueId: string; refreshKey?: unknown; onRestored: () => void | Promise<void> }) {
  const [archived, setArchived] = useState<{ id: string; name: string; archived_at: string }[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setArchived(await listArchivedMenuTemplates(venueId));
    } catch {
      // Only a convenience list: the packages themselves are unaffected.
    }
  }, [venueId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function restore(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await restoreMenuTemplate(id);
      await onRestored();
      await load();
    } catch (err) {
      setError(errorMessage(err, "Не успеа враќањето на пакетот."));
    } finally {
      setBusyId(null);
    }
  }

  if (archived.length === 0) return null;
  return (
    <div style={{ padding: "0 16px 16px" }}>
      <h3 className="panel-t" style={{ margin: "8px 0" }}>
        Архивирани пакети
      </h3>
      <p className="ev-hint" style={{ margin: "0 0 8px" }}>
        Остануваат на настаните што ги користат, но не се нудат за нови настани.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {archived.map((t) => (
          <li key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", margin: "4px 0" }}>
            <span style={{ flex: 1 }}>
              {t.name} <span className="ev-hint">· архивиран {formatVenueDatePadded(t.archived_at)}</span>
            </span>
            <button type="button" className="btn btn-ghost" disabled={busyId !== null} onClick={() => void restore(t.id)}>
              Врати
            </button>
          </li>
        ))}
      </ul>
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
