import Link from "next/link";
import { formatVenueDatePadded } from "@/lib/date";

/** Settings → "Податоци и приватност", where the owner downloads the venue's data. */
export const VENUE_DATA_EXPORT_HREF = "/venue/settings#podatoci";

/**
 * 0172: the platform admin scheduled this venue's deletion. Shown above every
 * venue page until the cron deletes the venue (or the admin cancels it).
 */
export function VenueDeletionBanner({ scheduledFor }: { scheduledFor: string | null | undefined }) {
  if (!scheduledFor) return null;
  return (
    <div
      role="alert"
      className="panel s1-locked-banner"
      style={{ margin: "0 0 16px", padding: "12px 16px", borderLeft: "4px solid var(--bad)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}
    >
      <span>
        Сметката на локалот ќе биде избришана на <b>{formatVenueDatePadded(scheduledFor)}</b>. Преземете ги вашите податоци
        пред тоа.
      </span>
      <Link className="btn btn-ghost" href={VENUE_DATA_EXPORT_HREF}>
        Преземи ги податоците
      </Link>
    </div>
  );
}
