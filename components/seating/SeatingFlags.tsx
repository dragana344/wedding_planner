"use client";

import { seatFlagsSummary, type SeatFlag } from "@/lib/seating/flags";

/**
 * 0181: at the top of the seating plan, how many seated guests declined or
 * hold more seats than their party, with each one's line. Nothing when all
 * is well.
 */
export function SeatingFlags({ flags, className }: { flags: SeatFlag[] | undefined; className?: string }) {
  if (!flags || flags.length === 0) return null;
  return (
    <details role="status" className={className}>
      <summary>
        <b>{seatFlagsSummary(flags.length)}</b>
      </summary>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
        {flags.map((f) => (
          <li key={f.guestId}>
            {f.fullName}: {f.text}
          </li>
        ))}
      </ul>
    </details>
  );
}
