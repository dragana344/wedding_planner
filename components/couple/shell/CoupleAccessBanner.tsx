import Link from "next/link";
import { COUPLE_DOWNLOADS_HREF, type CoupleAccessPhase } from "@/lib/couple/access";
import { formatVenueDatePadded } from "@/lib/date";

/**
 * The couple's access life cycle (group A task 2), above every couple page:
 * after the event the panel is read-only until `accessEnd`, then the data is
 * erased; a cancelled event's access ends early. Nothing otherwise.
 */
export function CoupleAccessBanner({
  phase,
  accessEnd,
  cancelled,
  isWedding,
}: {
  phase: Exclude<CoupleAccessPhase, "closed">;
  /** Last day ("YYYY-MM-DD") the couple can open the event. */
  accessEnd: string;
  cancelled: boolean;
  isWedding: boolean;
}) {
  const date = formatVenueDatePadded(accessEnd);
  if (phase === "memories") {
    return (
      <div role="status" className="access-banner">
        <b>{isWedding ? "Свадбата помина." : "Настанот помина."}</b> Пристапот е само за преглед до {date} — потоа податоците се бришат.{" "}
        <Link href={COUPLE_DOWNLOADS_HREF}>Преземете сè што сакате да зачувате.</Link>
      </div>
    );
  }
  if (cancelled) {
    return (
      <div role="status" className="access-banner">
        <b>Настанот е откажан.</b> Пристапот завршува на {date}.
      </div>
    );
  }
  return null;
}
