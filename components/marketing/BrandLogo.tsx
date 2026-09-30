import styles from "./BrandLogo.module.css";

// Geometry helpers for the mark. Everything is drawn in a 480×500 viewBox:
// four feature circles around a central "?" speech bubble.

function star(cx: number, cy: number, r: number) {
  // Four-point sparkle with concave sides.
  return `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r}Z`;
}

// Rounded to 2 decimals: Node and the browser disagree in the last digits of
// Math.cos/sin, and any difference in the SSR'd path strings breaks hydration.
const round = (v: number) => Math.round(v * 100) / 100;

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return [round(cx + r * Math.cos(a)), round(cy + r * Math.sin(a))] as const;
}

/** Three chasing arrows around (cx, cy), like the recycling symbol. */
function recycleArrows(cx: number, cy: number, r: number) {
  return [0, 120, 240].map((start) => {
    const from = start + 20;
    const to = start + 100;
    const [x1, y1] = polar(cx, cy, r, from);
    const [x2, y2] = polar(cx, cy, r, to);
    const [hx, hy] = polar(cx, cy, r, to + 14);
    const [ox, oy] = polar(cx, cy, r + 7, to - 4);
    const [ix, iy] = polar(cx, cy, r - 7, to - 4);
    return {
      arc: `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      head: `M${ox.toFixed(1)} ${oy.toFixed(1)} L${hx.toFixed(1)} ${hy.toFixed(1)} L${ix.toFixed(1)} ${iy.toFixed(1)}Z`,
    };
  });
}

const SPARKLES = [-60, -20, 20, 60, 120, 160, 200, 240].map((deg, i) => {
  const [x, y] = polar(240, 250, 86, deg);
  return star(x, y, i % 2 ? 7 : 10);
});

function Person({ x, y }: { x: number; y: number }) {
  return (
    <g fill="#fff">
      <circle cx={x} cy={y - 10} r={8.5} />
      <path d={`M${x - 15} ${y + 16} a15 15 0 0 1 30 0z`} />
    </g>
  );
}

function Kid({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} stroke="#fff" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <circle cx={0} cy={-18} r={7.5} fill="#fff" stroke="none" />
      <path d="M-16 -30 L-6 -6 L6 -6 L16 -30" strokeWidth={6} />
      <path d="M-7 -6 L-9 14 L9 14 L7 -6Z" fill="#fff" strokeWidth={4} />
      <path d="M-4 14 L-6 32 M4 14 L6 32" strokeWidth={6} />
    </g>
  );
}

function Note({ x, y }: { x: number; y: number }) {
  return (
    <g fill="#fff" stroke="#fff" strokeLinecap="round">
      <ellipse cx={x} cy={y} rx={6.5} ry={5} transform={`rotate(-22 ${x} ${y})`} stroke="none" />
      <path d={`M${x + 5.5} ${y - 2} V${y - 26} q2 8 10 12`} fill="none" strokeWidth={3.5} />
    </g>
  );
}

/**
 * The Каде си? mark: event planning (calendar), community (people + recycling),
 * celebration (music) and hospitality (dinner table) around a "where are you?" bubble.
 */
export function LogoMark({ id, className }: { id: string; className?: string }) {
  const g = (name: string) => `${id}-${name}`;
  const url = (name: string) => `url(#${g(name)})`;
  const recycle = recycleArrows(100, 252, 15);

  return (
    <svg viewBox="0 0 480 500" className={className} role="img" aria-label="Каде си?">
      <defs>
        <linearGradient id={g("top")} gradientUnits="userSpaceOnUse" x1="150" y1="30" x2="330" y2="190">
          <stop offset="0" stopColor="#e8174a" />
          <stop offset="1" stopColor="#ff7a1a" />
        </linearGradient>
        <linearGradient id={g("left")} gradientUnits="userSpaceOnUse" x1="10" y1="160" x2="190" y2="340">
          <stop offset="0" stopColor="#17b5a6" />
          <stop offset="1" stopColor="#0b6e86" />
        </linearGradient>
        <linearGradient id={g("right")} gradientUnits="userSpaceOnUse" x1="290" y1="160" x2="470" y2="340">
          <stop offset="0" stopColor="#9b3df2" />
          <stop offset="1" stopColor="#5a1fcf" />
        </linearGradient>
        <linearGradient id={g("bottom")} gradientUnits="userSpaceOnUse" x1="150" y1="300" x2="330" y2="480">
          <stop offset="0" stopColor="#2c66ea" />
          <stop offset="1" stopColor="#15308c" />
        </linearGradient>
        <radialGradient id={g("gloss")} cx="0.32" cy="0.25" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={g("glow")} gradientUnits="userSpaceOnUse" cx="240" cy="252" r="120">
          <stop offset="0.45" stopColor="#ffc247" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffc247" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={g("ring")} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff3b5c" />
          <stop offset="1" stopColor="#d9102f" />
        </linearGradient>
        <filter id={g("shadow")} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="6" stdDeviation="7" floodColor="#1d1440" floodOpacity="0.22" />
        </filter>
      </defs>

      <g filter={url("shadow")}>
        {(
          [
            ["left", 100, 250],
            ["right", 380, 250],
            ["top", 240, 106],
            ["bottom", 240, 394],
          ] as const
        ).map(([name, cx, cy]) => (
          <g key={name}>
            <circle cx={cx} cy={cy} r={96} fill={url(name)} />
            <circle cx={cx} cy={cy} r={96} fill={url("gloss")} />
          </g>
        ))}
      </g>

      {/* top: calendar with a magnifier reading a pulse */}
      <g stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <rect x={200} y={70} width={66} height={68} rx={11} />
        <path d="M200 92 H266 M218 60 V78 M248 60 V78" />
        <circle cx={256} cy={124} r={21} fill={url("top")} />
        <path d="M271 139 L290 158" strokeWidth={10} />
        <path d="M241 125 H247 L251 116 L257 133 L261 124 H270" strokeWidth={4} />
      </g>

      {/* left: people around a recycling symbol */}
      <circle cx={100} cy={252} r={44} fill="none" stroke="#fff" strokeWidth={5} />
      {(
        [
          [100, 210],
          [62, 274],
          [138, 274],
        ] as const
      ).map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={21} fill={url("left")} />
          <Person x={x} y={y} />
        </g>
      ))}
      <circle cx={100} cy={252} r={22} fill="#e9f8ea" />
      <g fill="#3cb043" stroke="#3cb043">
        {recycle.map((r) => (
          <g key={r.arc}>
            <path d={r.arc} fill="none" strokeWidth={5} strokeLinecap="round" />
            <path d={r.head} stroke="none" />
          </g>
        ))}
      </g>

      {/* right: music notes over three dancing kids */}
      <Note x={352} y={214} />
      <Note x={386} y={200} />
      <Note x={414} y={216} />
      <Kid x={352} y={282} s={0.9} />
      <Kid x={382} y={274} />
      <Kid x={412} y={282} s={0.9} />

      {/* bottom: set table with a cloche between two chairs */}
      <g stroke="#fff" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M216 398 A24 24 0 0 1 264 398 Z" fill="#fff" strokeWidth={4} />
        <circle cx={240} cy={371} r={3.5} fill="#fff" />
        <path d="M206 406 H274 M240 406 V446 M226 446 H254" />
        <path d="M190 376 L196 414 H216 M196 414 L190 448 M214 414 L216 448" />
        <path d="M290 376 L284 414 H264 M284 414 L290 448 M266 414 L264 448" />
      </g>

      {/* centre: glowing "?" bubble */}
      <circle cx={240} cy={252} r={120} fill={url("glow")} />
      <g fill="#ffd54a">
        {SPARKLES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path d="M240 342 L221 313 A66 66 0 1 1 259 313 Z" fill="#fff" stroke="#fff" strokeWidth={22} strokeLinejoin="round" />
      <path d="M240 342 L221 313 A66 66 0 1 1 259 313 Z" fill="#fff" stroke={url("ring")} strokeWidth={12} strokeLinejoin="round" />
      <text x={240} y={286} textAnchor="middle" fontSize={104} fontWeight={900} fill="#e5184a" className={styles.markQ}>
        ?
      </text>
    </svg>
  );
}

const INK = "#0b1026";
const RED = "#d63045";

/**
 * "K@De си?" wordmark, traced from the logo artwork as monoline strokes with
 * round caps, plus the "where @re you ?" tagline. Coordinates are the
 * artwork's own pixels, so the drawing can be checked against it directly.
 */
export function Wordmark({ id, className, tagline = true }: { id: string; className?: string; tagline?: boolean }) {
  const g = (name: string) => `${id}-${name}`;

  return (
    <svg
      viewBox={tagline ? "85 68 1565 527" : "85 68 1565 359"}
      className={className}
      role="img"
      aria-label={tagline ? "Каде си? where are you?" : "Каде си?"}
    >
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {/* K */}
        <path d="M118.5 176.5 V392.5 M254.5 176.5 L118.5 312.5 M149 281 L256 392.5" stroke={INK} strokeWidth={47} />

        {/* @: the Montserrat SemiBold glyph (same face as the tagline), outlined and fitted to the old box */}
        <path
          d="M415.6 424.9Q389.9 424.9 368.7 416.6Q347.6 408.4 332.3 393.3Q317 378.2 308.8 358Q300.5 337.7 300.5 313.6Q300.5 289.6 308.8 269.4Q317 249.3 332.4 234.5Q347.9 219.6 369.2 211.4Q390.6 203.1 416.6 203.1Q441.6 203.1 462.5 211Q483.4 218.9 498.6 233.1Q513.7 247.3 522.1 266.8Q530.5 286.2 530.5 309.5Q530.5 330.4 524.9 345.6Q519.3 360.8 509 368.8Q498.7 376.8 483.9 376.8Q468.8 376.8 459.9 367.8Q451.1 358.8 451.1 341.8V328L452.1 314.1L449.9 282.5V254.9H476.8V337.4Q476.8 346.7 480.6 350.4Q484.4 354.2 489.5 354.2Q496 354.2 500.6 349.1Q505.2 344 507.5 334Q509.9 324.1 509.9 310Q509.9 290.6 503.2 274.5Q496.5 258.5 484 247Q471.5 235.4 454.4 229.2Q437.2 223 416.6 223Q395.5 223 378.2 229.7Q361 236.4 348.6 248.5Q336.2 260.7 329.5 277.3Q322.8 294 322.8 313.6Q322.8 333.8 329.4 350.6Q336 367.3 348.2 379.3Q360.5 391.4 377.5 398Q394.5 404.7 415.6 404.7Q426.8 404.7 439.2 402.2Q451.6 399.6 462.7 394L469.3 413.5Q458.1 419 443.6 422Q429 424.9 415.6 424.9ZM409.3 376.8Q392.5 376.8 379.4 368.9Q366.3 361 358.7 347Q351 333.1 351 314.9Q351 296.9 358.5 282.9Q366.1 268.9 379.3 261.2Q392.5 253.4 409.3 253.4Q425.6 253.4 437.7 260.6Q449.9 267.7 456.7 281.3Q463.5 294.9 463.5 314.9Q463.5 334.8 456.9 348.6Q450.4 362.5 438.2 369.6Q426.1 376.8 409.3 376.8ZM414.4 353.2Q424.9 353.2 432.9 348.7Q440.9 344.2 445.6 335.5Q450.4 326.8 450.4 314.9Q450.4 302.7 445.6 294.3Q440.9 285.9 432.9 281.5Q424.9 277 414.4 277Q403.7 277 395.6 281.6Q387.4 286.2 383 294.7Q378.5 303.2 378.5 314.9Q378.5 326.8 383 335.3Q387.4 343.8 395.6 348.5Q403.7 353.2 414.4 353.2Z"
          fill={RED}
          stroke="none"
        />

        {/* D drawn as a play button */}
        <path d="M596 242 L590 394 L720 318 Z" fill={INK} stroke={INK} strokeWidth={40} />
        <path d="M611 268 L611 366 L700 317 Z" fill={RED} stroke={RED} strokeWidth={4} />

        {/* е */}
        {/* The bowl starts just above the bar's centre line so its round cap closes the
            bar's lower-right corner flush, instead of bulging below it. */}
        <path d="M808 318 H943" stroke={INK} strokeWidth={28} strokeLinecap="butt" />
        <path d="M943.1 312 A68 72.5 0 1 0 921.5 377.9" stroke={INK} strokeWidth={40} />

        {/* "си?" sits a word-space further right than the artwork, to separate the two words */}
        <g transform="translate(40 0)">
          {/* с */}
          <path d="M1155 262 A64 71 0 1 0 1155 390" stroke={INK} strokeWidth={42} />

          {/* и, with a location pin standing in for the breve */}
          <path d="M1247.5 252 V398 L1357 252 V398" stroke={INK} strokeWidth={37} />
          {/* pin and its ring sit clear of the letter */}
          <g transform="translate(0 -28)">
            <path d="M1246 234.5 A56.5 13.5 0 0 1 1359 234.5" stroke={INK} strokeWidth={8} />
            <path
              d="M1303.5 229 C1303.5 229 1259.5 191 1259.5 156.5 A44 44 0 0 1 1347.5 156.5 C1347.5 191 1303.5 229 1303.5 229 Z"
              stroke={RED}
              strokeWidth={18}
            />
            <path
              d="M0 17 C-19 4 -21 -11 -11 -14 C-5 -15.5 -1 -11.5 0 -7.5 C1 -11.5 5 -15.5 11 -14 C21 -11 19 4 0 17 Z"
              transform="translate(1303.5 158)"
              fill={RED}
              stroke={RED}
              strokeWidth={3}
            />
            <path d="M1359 234.5 A56.5 13.5 0 0 1 1246 234.5" stroke={INK} strokeWidth={8} />
          </g>

          {/* ? */}
          <path d="M1468.3 218.9 A49.5 49.5 0 1 1 1548 266 Q1507 292 1507 335" stroke={RED} strokeWidth={48} />
          <circle cx={1504.5} cy={394} r={24} fill={RED} />
        </g>
      </g>

      {tagline ? (
        <g transform="translate(20 0)">
          <defs>
            <linearGradient id={g("dashL")} gradientUnits="userSpaceOnUse" x1="150" y1="0" x2="358" y2="0">
              <stop offset="0" stopColor="#2aa39a" />
              <stop offset="0.5" stopColor="#3b72d2" />
              <stop offset="1" stopColor="#4a1fd0" />
            </linearGradient>
            <linearGradient id={g("dashR")} gradientUnits="userSpaceOnUse" x1="1285" y1="0" x2="1478" y2="0">
              <stop offset="0" stopColor="#5a26d6" />
              <stop offset="0.5" stopColor="#a8307c" />
              <stop offset="1" stopColor={RED} />
            </linearGradient>
          </defs>
          <circle cx={112.5} cy={541.5} r={15.5} fill="#2aa39a" />
          <path d="M151 541.5 H357" stroke={`url(#${g("dashL")})`} strokeWidth={10} strokeLinecap="round" />
          <text
            x={825.5}
            y={566}
            textAnchor="middle"
            textLength={795}
            lengthAdjust="spacing"
            fontSize={82}
            fontWeight={600}
            fill={INK}
            className={styles.tagline}
          >
            where <tspan fill={RED}>@</tspan>re you ?
          </text>
          <path d="M1286 541.5 H1476" stroke={`url(#${g("dashR")})`} strokeWidth={10} strokeLinecap="round" />
          <circle cx={1518} cy={542} r={15} fill={RED} />
        </g>
      ) : null}
    </svg>
  );
}
