import type { EventType } from "@/lib/venue/events";
import type { SeatingMode } from "@/lib/venue/event-wizard";

// Line illustrations for the wizard's "Каков настан славиме?" cards: a soft
// peach blob behind a gold-brown outline (currentColor, set in panel.css
// .ev-wiz-ty-art) with a few light-gold filled accents.

const ACCENT = "#f3d08f";
const BLOB = "#fbe5c6";

const SHAPES: Record<EventType, React.ReactNode> = {
  wedding: (
    <>
      <circle cx="22" cy="33" r="10" />
      <circle cx="34" cy="33" r="10" />
      <path d="M28 11v4M20.5 13l2 3M35.5 13l-2 3" />
    </>
  ),
  birthday: (
    <>
      <rect x="13" y="21" width="30" height="7" rx="1.5" fill={ACCENT} />
      <path d="M15 28v15h26V28M28 21v22" />
      <path d="M28 21c-3-6-10-6-8.5-1.5.8 2 5 1.5 8.5 1.5ZM28 21c3-6 10-6 8.5-1.5-.8 2-5 1.5-8.5 1.5Z" />
    </>
  ),
  baptism: (
    <>
      <path d="m28 15 3.9 8.3 9.1 1.1-6.7 6.3 1.7 9-8-4.4-8 4.4 1.7-9-6.7-6.3 9.1-1.1Z" fill={ACCENT} />
      <path d="M41 13l1-3M44 17l3-1M14 41l-2 2M12 37h-2" />
    </>
  ),
  graduation: (
    <>
      <path d="M6 22 28 13l22 9-22 9Z" fill={ACCENT} />
      <path d="M16 26.5V35c0 3 5.5 6 12 6s12-3 12-6v-8.5M44 24.5V35" />
      <circle cx="44" cy="37" r="1.8" />
    </>
  ),
  anniversary: (
    <>
      <circle cx="28" cy="22" r="11" />
      <circle cx="28" cy="22" r="8" />
      <path d="M28 26.5c-4.5-2.6-5.6-6.4-3-7.7 1.4-.7 2.5 0 3 1 .5-1 1.6-1.7 3-1 2.6 1.3 1.5 5.1-3 7.7Z" fill={ACCENT} />
      <path d="m21 31-4 13 5-2.5 3 4.5 2.5-12M35 31l4 13-5-2.5-3 4.5-2.5-12" />
    </>
  ),
  family: (
    <>
      <circle cx="28" cy="19" r="5" fill={ACCENT} />
      <circle cx="16" cy="23" r="4" />
      <circle cx="40" cy="23" r="4" />
      <path d="M19 41c0-6 4-10 9-10s9 4 9 10M8 41c0-5 3-8 8-8 1.8 0 3.3.5 4.5 1.3M48 41c0-5-3-8-8-8-1.8 0-3.3.5-4.5 1.3M7 41h42" />
    </>
  ),
  corporate: (
    <>
      <rect x="10" y="19" width="36" height="24" rx="3" />
      <path d="M22 19v-3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v3M10 29h36" />
      <rect x="25" y="26.5" width="6" height="5" rx="1" fill={ACCENT} />
    </>
  ),
  conference: (
    <>
      <circle cx="34" cy="20" r="7" fill={ACCENT} />
      <path d="M29.5 25.5 17 40l2 2 14.5-12.5M17.5 41.5c-3 3-6 3.5-8.5 1.5" />
      <path d="M44 14c2 2 2 5 0 7M47 11c4 4 4 9 0 13M21 11l2 3M17 15l3 1" />
    </>
  ),
  presentation: (
    <>
      <rect x="11" y="12" width="34" height="22" rx="1.5" />
      <path d="M28 9v3M21 34l-4 10M35 34l4 10M28 34v8" />
      <path d="M17 30v-4M22 30v-7M27 30v-5" />
      <path d="m31 27 4-5 3 2 3-5" />
      <rect x="25.5" y="25" width="3" height="5" fill={ACCENT} stroke="none" />
    </>
  ),
  seminar: (
    <>
      <rect x="12" y="13" width="32" height="21" rx="2" />
      <path d="M7 38h42l-3 4H10Z" />
      <path d="M25 19v10l8-5Z" fill={ACCENT} />
    </>
  ),
  team_building: (
    <>
      <circle cx="16" cy="21" r="4.5" />
      <circle cx="28" cy="18" r="4.5" fill={ACCENT} />
      <circle cx="40" cy="21" r="4.5" />
      <path d="M8 40c0-5.5 3.5-9 8-9s8 3.5 8 9M20 37c0-6 3.5-10 8-10s8 4 8 10M32 40c0-5.5 3.5-9 8-9s8 3.5 8 9M7 40h42" />
    </>
  ),
  new_year: (
    <>
      <path d="m28 6 1.4 2.9 3.2.4-2.3 2.2.6 3.1-2.9-1.5-2.9 1.5.6-3.1-2.3-2.2 3.2-.4Z" fill={ACCENT} />
      <path d="M28 15 19 25h5l-8 9h6l-9 9h30l-9-9h6l-8-9h5Z" />
      <path d="M26 43v4h4v-4" />
      <circle cx="24" cy="30" r="1.2" />
      <circle cx="33" cy="37" r="1.2" />
    </>
  ),
  school: (
    <>
      <path d="M28 17c-5-3-11-4-17-3v26c6-1 12 0 17 3Z" fill={ACCENT} />
      <path d="M28 17c5-3 11-4 17-3v26c-6-1-12 0-17 3ZM28 17v26M33 23l7-1.5M33 28l7-1.5" />
    </>
  ),
  baby_shower: (
    <>
      <path d="M13 25a14 14 0 0 1 14-14v14Z" fill={ACCENT} />
      <path d="M11 25h32a14 12 0 0 1-14 12h-4a14 12 0 0 1-14-12ZM43 25l3-8h4" />
      <circle cx="18" cy="42" r="3.5" />
      <circle cx="36" cy="42" r="3.5" />
      <path d="M38 15c-2.6-1.6-3.2-3.8-1.7-4.6.8-.4 1.4 0 1.7.6.3-.6.9-1 1.7-.6 1.5.8.9 3-1.7 4.6Z" />
    </>
  ),
  other: (
    <>
      <circle cx="28" cy="28" r="15" />
      <circle cx="22" cy="28" r="1.6" fill="currentColor" />
      <circle cx="28" cy="28" r="1.6" fill="currentColor" />
      <circle cx="34" cy="28" r="1.6" fill="currentColor" />
    </>
  ),
};

export function EventTypeIllustration({ type }: { type: EventType }) {
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <path d="M31 9c9 0 17 7 17 17s-8 20-19 20S10 38 10 28 21 9 31 9Z" fill={BLOB} />
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {SHAPES[type]}
      </g>
    </svg>
  );
}

const MODE_SHAPES: Record<SeatingMode, React.ReactNode> = {
  full: (
    <>
      <path d="M12 27 28 13l16 14M16 24v18h24V24" />
      <path d="M24 42v-9h8v9" fill={ACCENT} />
      <path d="M38 10l1-3M42 13l3-1M41 17h3" />
    </>
  ),
  mini: (
    <>
      <circle cx="21" cy="22" r="5.5" fill={ACCENT} />
      <circle cx="35" cy="22" r="5.5" />
      <path d="M11 41c0-6.5 4.5-11 10-11s10 4.5 10 11M30.5 31.5c1.3-.9 2.8-1.5 4.5-1.5 5.5 0 10 4.5 10 11M10 41h36" />
    </>
  ),
};

/** Step 1's "Цел простор / Мини настан" art, on a round peach backdrop. */
export function SeatingModeIllustration({ mode }: { mode: SeatingMode }) {
  return (
    <svg viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {MODE_SHAPES[mode]}
      </g>
    </svg>
  );
}
