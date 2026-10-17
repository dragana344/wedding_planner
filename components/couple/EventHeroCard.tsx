"use client";

import { useEffect, useState } from "react";
import { Cormorant_Garamond } from "next/font/google";
import { formatMkDateWithWeekday } from "@/lib/date";
import { formatTimeRange } from "@/lib/venue/event-display";
import { splitCoupleNames, heroPhase, type HeroPhase } from "@/lib/couple/event-hero";
import { Icon } from "@/components/venue/shell/Icon";
import { GuestCountInlineEdit } from "@/components/couple/GuestCountInlineEdit";
import "./EventHeroCard.css";

// Cyrillic subset: couple names are routinely Macedonian Cyrillic (e.g.
// "Ивана и Марко"), and a latin-only font silently falls back to a system
// face for those glyphs instead of erroring.
const cormorant = Cormorant_Garamond({ subsets: ["latin", "cyrillic"], weight: "400", style: ["normal", "italic"] });

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function EventHeroCard({
  coupleNames,
  eventDate,
  startIso,
  endIso,
  startTime,
  endTime,
  venueName,
  guestCount,
}: {
  coupleNames: string;
  eventDate: string;
  /** Precomputed instants (lib/couple/event-hero.ts's eventStartInstant/eventEndInstant) — the client only ticks against them. */
  startIso: string;
  endIso: string;
  startTime: string | null;
  endTime: string | null;
  venueName: string;
  guestCount: number | null;
}) {
  // Rendered only after mount, same reason as components/invite/countdown.tsx's
  // useCountdown: the server and client would otherwise disagree on "now".
  const [phase, setPhase] = useState<HeroPhase | null>(null);

  useEffect(() => {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const tick = () => setPhase(heroPhase(new Date(), start, end));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [startIso, endIso]);

  const names = splitCoupleNames(coupleNames);
  const timeRange = formatTimeRange(startTime, endTime);

  return (
    <section className="event-hero" aria-labelledby="event-hero-names">
      <div className="event-hero__top">
        <div>
          <p className="event-hero__label">Вашиот настан</p>
          <h2 className={`event-hero__names ${cormorant.className}`} id="event-hero-names">
            {names ? (
              <>
                {names.first} <span className="event-hero__amp">{names.sep}</span> {names.second}
              </>
            ) : (
              coupleNames
            )}
          </h2>
          <p className="event-hero__date">{formatMkDateWithWeekday(eventDate)}</p>
        </div>

        <div className="countdown" aria-live="polite">
          {phase === null ? null : phase.kind === "countdown" ? (
            <>
              <div className="countdown__unit">
                <div className={`countdown__num ${cormorant.className}`}>{pad(phase.days)}</div>
                <div className="countdown__label">ДЕНА</div>
              </div>
              <div className="countdown__sep" />
              <div className="countdown__unit">
                <div className={`countdown__num ${cormorant.className}`}>{pad(phase.hours)}</div>
                <div className="countdown__label">ЧАСА</div>
              </div>
              <div className="countdown__sep" />
              <div className="countdown__unit">
                <div className={`countdown__num ${cormorant.className}`}>{pad(phase.minutes)}</div>
                <div className="countdown__label">МИН</div>
              </div>
            </>
          ) : (
            <span className={`countdown__message ${cormorant.className}`}>
              {phase.kind === "today" ? "Денес е вашиот ден" : "Честитки, младенци!"}
            </span>
          )}
        </div>
      </div>

      <div className="event-hero__divider" />

      <ul className="event-hero__details">
        {timeRange ? (
          <li>
            <Icon name="clock" size="sm" className="event-hero__icon" />
            {timeRange}
          </li>
        ) : null}
        {venueName ? (
          <li>
            <Icon name="pin" size="sm" className="event-hero__icon" />
            {venueName}
          </li>
        ) : null}
        <li>
          <Icon name="users" size="sm" className="event-hero__icon" />
          <GuestCountInlineEdit initialValue={guestCount} />
        </li>
      </ul>
    </section>
  );
}
