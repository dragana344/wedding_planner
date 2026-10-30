"use client";

import { useCallback, useEffect, useState } from "react";
import { reportElevationRejected, useManagerElevation } from "@/components/venue/shell/ManagerElevationContext";
import type { EventDetail, EventPrivateDetails } from "@/lib/venue/events";

/**
 * The couple's contacts and each event's price/deposit are manager/owner
 * only (migration 0117): pages send events without them, and this loads them
 * from /api/venue/events/private while a manager is logged in — and forgets
 * them the moment that login ends.
 */
export function useEventPrivateDetails() {
  const { token } = useManagerElevation();
  const [byId, setById] = useState<Map<string, EventPrivateDetails> | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!token) {
      setById(null);
      setFailed(false);
      return;
    }
    setFailed(false);
    const controller = new AbortController();
    fetch("/api/venue/events/private", { headers: { "x-venue-manager-token": token }, signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          if (res.status === 403) reportElevationRejected();
          else setFailed(true);
          return;
        }
        const { events } = (await res.json()) as { events: EventPrivateDetails[] };
        setById(new Map(events.map((e) => [e.id, e])));
      })
      .catch((err) => {
        // Superseded by a newer token/reload: not a failure.
        if (err?.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, [token, version]);

  /** Re-reads the details, e.g. after a manager saved contacts or finance. */
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const withPrivate = useCallback(
    <T extends EventDetail>(event: T): T => {
      const details = byId?.get(event.id);
      return details ? { ...event, ...details } : event;
    },
    [byId],
  );

  return { loaded: byId !== null, failed, withPrivate, reload };
}
