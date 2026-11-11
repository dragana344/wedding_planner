// Extra line icons for the couple's seating page that the panel's
// <IconSprite /> doesn't carry.

type SvgProps = { className?: string };

const LINE = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** The leafy sprig beside the page title. */
export function SprigIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 48 96" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 94C18 70 24 44 40 6" />
      <path d="M20 70c-8-2-13-8-14-16 8 1 13 7 14 16Z" />
      <path d="M22 60c7-4 14-4 20 0-6 5-13 5-20 0Z" />
      <path d="M25 48c-8-3-12-10-12-18 8 2 12 9 12 18Z" />
      <path d="M28 40c6-5 12-6 18-3-5 6-11 7-18 3Z" />
      <path d="M32 28c-6-4-9-11-8-18 7 3 9 10 8 18Z" />
      <path d="M17 82c-7-1-12-6-14-13 7 0 12 5 14 13Z" />
    </svg>
  );
}

export function PrinterIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...LINE} aria-hidden>
      <path d="M7 9V3.5h10V9" />
      <rect x="3.5" y="9" width="17" height="8" rx="2" />
      <path d="M7 14h10v6.5H7Z" />
    </svg>
  );
}

export function QrIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...LINE} aria-hidden>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h2.5v2.5H14ZM18 18h2.5v2.5H18ZM14 18.5v2M20.5 14v2" />
    </svg>
  );
}
