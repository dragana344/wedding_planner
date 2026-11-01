"use client";

import { useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { ManagerElevationContext } from "@/components/venue/shell/ManagerElevationContext";
import { markChangesSeenViaApi } from "@/lib/venue/changes-client";
import { markMenuNumbersSeenViaApi, NewerMenuNumbersError } from "@/lib/venue/menu-numbers-client";
import type { SeenAction } from "@/lib/venue/notifications";
import { errorMessage } from "@/lib/venue/user-error";

/** Видено for one notification; shown to a manager only (the server enforces it too). */
export function NotificationSeenButton({ action }: { action: SeenAction }) {
  const router = useRouter();
  // Read the context directly so a list rendered outside the provider simply has no button.
  const token = useContext(ManagerElevationContext)?.token ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newer, setNewer] = useState(false);
  if (!token) return null;

  async function handleSeen() {
    setBusy(true);
    setError("");
    setNewer(false);
    try {
      if (action.section === "menu_numbers") {
        await markMenuNumbersSeenViaApi(action.eventId, action.submissionId ?? "", token);
        router.refresh();
      } else {
        const result = await markChangesSeenViaApi(action.eventId, action.section, action.upTo, token);
        if (result.newer) setNewer(true);
        router.refresh();
      }
    } catch (err) {
      if (err instanceof NewerMenuNumbersError) setNewer(true);
      else setError(errorMessage(err, "Не успеа означувањето како видено."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="notif-seen">
      <button type="button" className="btn btn-gold" onClick={handleSeen} disabled={busy}>
        Видено
      </button>
      {newer ? <span role="status">Има нови промени — освежете.</span> : null}
      {error ? <span role="alert">{error}</span> : null}
    </span>
  );
}
