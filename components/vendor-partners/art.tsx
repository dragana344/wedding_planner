import type { VendorPartnerCategory } from "@/lib/vendor-partners/categories";

// Inline on purpose: the directory also renders on the landing page, which
// does not mount the panel's <IconSprite />.

type SvgProps = { className?: string };

const ART: Record<VendorPartnerCategory, React.ReactNode> = {
  music: (
    <path
      fill="currentColor"
      stroke="none"
      d="M9.2 17.6a2.9 2.9 0 1 1-1.6-2.6V5.9l11.2-2.6v12a2.9 2.9 0 1 1-1.6-2.6V7.4l-8 1.9Z"
    />
  ),
  photography: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2.2" />
      <path d="M8 7l1.6-2.6h4.8L16 7" />
      <circle cx="12" cy="13.4" r="3.7" />
      <circle cx="12" cy="13.4" r="1.9" />
      <circle cx="17.9" cy="9.8" r="0.7" fill="currentColor" stroke="none" />
    </>
  ),
  florist: (
    <g fill="currentColor" stroke="none">
      {[0, 72, 144, 216, 288].map((deg) => (
        <circle key={deg} cx="12" cy="7.3" r="3.6" transform={`rotate(${deg} 12 12)`} />
      ))}
      <circle cx="12" cy="12" r="2.4" fill="#000" fillOpacity="0.16" />
    </g>
  ),
  decoration: (
    <>
      <path d="M11 3.5l1.9 5.4 5.4 1.9-5.4 1.9L11 18.1l-1.9-5.4-5.4-1.9 5.4-1.9Z" />
      <path d="M18 15l.8 2.2 2.2.8-2.2.8L18 21l-.8-2.2-2.2-.8 2.2-.8Z" />
    </>
  ),
  catering: (
    <>
      <path d="M7 2.5v8a2 2 0 0 0 4 0v-8M9 2.5v19M5 2.5v6" />
      <path d="M17 2.5c-1.8 1.8-2.3 4-2.3 6.2v4.3h4.6V2.5M18.3 13v8.5" />
    </>
  ),
  jeweler: (
    <>
      <circle cx="12" cy="15" r="5.6" />
      <path d="M9.4 5.6l1-2.1h3.2l1 2.1L12 9.2Z" />
    </>
  ),
  equipment: (
    <>
      <rect x="6" y="2.8" width="12" height="18.4" rx="2.2" />
      <circle cx="12" cy="14.6" r="3.3" />
      <circle cx="12" cy="7.4" r="1.4" />
    </>
  ),
  cakes_desserts: (
    <>
      <rect x="4" y="12" width="16" height="8.5" rx="1.6" />
      <path d="M4 15.6c2 1.3 4 1.3 6 0s4-1.3 6 0 3 .9 4 .4M9 12V9M15 12V9" />
      <path d="M9 6.8c-.7-.8-.4-1.8 0-2.4.4.6.7 1.6 0 2.4ZM15 6.8c-.7-.8-.4-1.8 0-2.4.4.6.7 1.6 0 2.4Z" />
    </>
  ),
  makeup_hair: (
    <>
      <path d="M8.5 21h7v-8.2h-7Z" />
      <path d="M9.6 12.8V8.4L14.4 5v7.8" />
    </>
  ),
};

export function CategoryArt({ category, className }: { category: VendorPartnerCategory; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ART[category]}
    </svg>
  );
}

export function PinIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

export function ArrowUpRightIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

export function SearchIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </svg>
  );
}

export function ChevronIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** The four-point star from the header's eyebrow and corner. */
export function SparkleIcon({ className, outline = false }: SvgProps & { outline?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill={outline ? "none" : "currentColor"}
        stroke={outline ? "currentColor" : "none"}
        strokeWidth="1.1"
        strokeLinejoin="round"
        d="M12 1.5c.6 5.5 4.9 9.9 10.5 10.5-5.6.6-9.9 4.9-10.5 10.5C11.4 16.9 7.1 12.6 1.5 12 7.1 11.4 11.4 7 12 1.5Z" />
    </svg>
  );
}

export function ArrowRightIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

export function CloseIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

const LINE = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function PhoneIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...LINE} aria-hidden>
      <path d="M5 3.5h3.2l1.6 4.2-2.1 1.4a11 11 0 0 0 5.2 5.2l1.4-2.1 4.2 1.6V17a2.5 2.5 0 0 1-2.5 2.5A15.5 15.5 0 0 1 2.5 6 2.5 2.5 0 0 1 5 3.5Z" />
    </svg>
  );
}

export function ChatIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...LINE} aria-hidden>
      <path d="M4 19.5 5.3 16A8 8 0 1 1 8 18.7Z" />
    </svg>
  );
}

export function GlobeIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...LINE} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5Z" />
    </svg>
  );
}

export function InstagramIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...LINE} aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function FacebookIcon({ className }: SvgProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" {...LINE} aria-hidden>
      <path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4a21 21 0 0 0-2.4-.1c-2.3 0-3.9 1.4-3.9 4v2.2H8.8v3h2.6V21" />
    </svg>
  );
}
