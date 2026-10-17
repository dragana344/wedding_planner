"use client";

import { useManagerElevation } from "./ManagerElevationContext";
import { VENUE_TIME_ZONE } from "@/lib/date";

const DAY = new Intl.DateTimeFormat("mk-MK", { day: "numeric", month: "long", year: "numeric", timeZone: VENUE_TIME_ZONE });

/**
 * Security review #4: an admin-mediated password reset has no owner-facing
 * signal by itself (identity verification of the phone caller is a separate,
 * deliberately-skipped tradeoff — see the comment on managerPasswordReset).
 * This is the mitigation that *is* in place: whoever next elevates as this
 * manager sees a one-time notice, so an unexpected reset is at least visible
 * rather than silent. Dismissing clears it server-side — it does not
 * reappear on a later elevation.
 */
export function PasswordResetNotice() {
  const { passwordResetNoticeAt, dismissPasswordResetNotice } = useManagerElevation();
  if (!passwordResetNoticeAt) return null;

  return (
    <div
      role="status"
      className="panel s1-locked-banner"
      style={{ margin: "0 0 16px", padding: "12px 16px", borderLeft: "4px solid var(--gold-lo)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}
    >
      <span>
        Вашата лозинка беше ресетирана од поддршка на <b>{DAY.format(new Date(passwordResetNoticeAt))}</b>. Ако не
        побаравте ресетирање, контактирајте нè.
      </span>
      <button type="button" className="btn btn-ghost" onClick={() => void dismissPasswordResetNotice()}>
        Разбирам
      </button>
    </div>
  );
}
