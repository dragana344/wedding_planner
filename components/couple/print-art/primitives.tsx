import type { ReactNode } from "react";

// Building blocks for the print designs. Everything is drawn on a 105 x 148
// canvas (an A6 card; the A4 poster has the same proportions). Shapes take a
// position (x, y), a scale (s) and colours, and are plain SVG.

export const W = 105;
export const H = 148;

export const LEAF = "M0 0 C3 -3.2 8 -3.2 11 0 C8 3.2 3 3.2 0 0 Z";
export const GREENS = ["#8fae86", "#6f9a6a"];
export const HEART = "M0 0 C-3 -4 -8 -1 0 6 C8 -1 3 -4 0 0 Z";

export function Bg({ fill }: { fill: string }) {
  return <rect width={W} height={H} fill={fill} />;
}

export function Frame({ inset = 4.5, stroke = "#b8913a", width = 0.5, double = false, gap = 2.3, inner }: { inset?: number; stroke?: string; width?: number; double?: boolean; gap?: number; inner?: string }) {
  return (
    <>
      <rect x={inset} y={inset} width={W - 2 * inset} height={H - 2 * inset} fill="none" stroke={stroke} strokeWidth={width} />
      {double ? <rect x={inset + gap} y={inset + gap} width={W - 2 * (inset + gap)} height={H - 2 * (inset + gap)} fill="none" stroke={inner ?? stroke} strokeWidth={width / 2} /> : null}
    </>
  );
}

export function Diamond({ x, y, r = 0.9, fill = "#b8913a" }: { x: number; y: number; r?: number; fill?: string }) {
  return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} transform={`rotate(45 ${x} ${y})`} fill={fill} />;
}

export function Heart({ x, y, s = 1, fill = "#e6b8b3", stroke, rot = 0 }: { x: number; y: number; s?: number; fill?: string; stroke?: string; rot?: number }) {
  return <path d={HEART} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} fill={fill} stroke={stroke} strokeWidth={stroke ? 0.4 : 0} />;
}

export function Star({ x, y, r = 3, fill = "#f2c75c", rot = 0, inner = 0.45 }: { x: number; y: number; r?: number; fill?: string; rot?: number; inner?: number }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = ((-90 + i * 36) * Math.PI) / 180;
    const rr = i % 2 === 0 ? r : r * inner;
    return `${(rr * Math.cos(a)).toFixed(2)},${(rr * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return <polygon points={pts} transform={`translate(${x} ${y}) rotate(${rot})`} fill={fill} />;
}

/** A four-point sparkle. */
export function Sparkle({ x, y, r = 2.4, fill = "#f2c75c" }: { x: number; y: number; r?: number; fill?: string }) {
  return <path d={`M0 ${-r} Q0.4 -0.4 ${r} 0 Q0.4 0.4 0 ${r} Q-0.4 0.4 ${-r} 0 Q-0.4 -0.4 0 ${-r} Z`} transform={`translate(${x} ${y})`} fill={fill} />;
}

/** A curved stem along +x with leaves on both sides. */
export function Sprig({ scale = 1, colors = GREENS, stem = "#6f9a6a" }: { scale?: number; colors?: string[]; stem?: string }) {
  const points: [number, number][] = [[8.8, -2.4], [17.6, -3.8], [26.4, -4.4], [35.2, -4.2]];
  return (
    <g transform={`scale(${scale})`}>
      <path d="M0 0 Q22 -7 44 -3" fill="none" stroke={stem} strokeWidth="0.6" strokeLinecap="round" />
      {points.map(([x, y], i) => (
        <g key={i}>
          <path d={LEAF} fill={colors[i % colors.length]} transform={`translate(${x} ${y}) rotate(-48)`} />
          <path d={LEAF} fill={colors[(i + 1) % colors.length]} transform={`translate(${x} ${y}) rotate(38)`} />
        </g>
      ))}
      <path d={LEAF} fill={colors[0]} transform="translate(44 -3) rotate(-8)" />
    </g>
  );
}

export function Leaf({ x, y, rot = 0, s = 1, fill = GREENS[0] }: { x: number; y: number; rot?: number; s?: number; fill?: string }) {
  return <path d={LEAF} fill={fill} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} />;
}

export function Flower({ x, y, r = 1, petal = "#efc9c4", center = "#d9a441" }: { x: number; y: number; r?: number; petal?: string; center?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${r})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={2.7 * Math.cos((a * Math.PI) / 180)} cy={2.7 * Math.sin((a * Math.PI) / 180)} r="2.2" fill={petal} />
      ))}
      <circle r="1.4" fill={center} />
    </g>
  );
}

/** A daisy / sunflower: many long petals round a centre. */
export function Daisy({ x, y, s = 1, petal = "#fff", center = "#f2c75c", petals = 12, len = 3.6 }: { x: number; y: number; s?: number; petal?: string; center?: string; petals?: number; len?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {Array.from({ length: petals }, (_, i) => (
        <ellipse key={i} cx="0" cy={-(len - 0.4)} rx="1.25" ry={len / 1.5} transform={`rotate(${(360 / petals) * i})`} fill={petal} />
      ))}
      <circle r="2.1" fill={center} />
    </g>
  );
}

export function Rose({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <circle r="6" fill="#e59aa0" />
      <circle r="4.7" fill="#efb3b7" />
      <path d="M-3.4 0.4 A3.4 3.4 0 0 1 3.2 -1.2" fill="none" stroke="#d4818a" strokeWidth="0.55" strokeLinecap="round" />
      <circle r="2.5" fill="#e59aa0" />
      <path d="M-1.4 0.6 A1.5 1.5 0 0 1 1.5 -0.5" fill="none" stroke="#c96f79" strokeWidth="0.5" strokeLinecap="round" />
    </g>
  );
}

export function Cloud({ x, y, s = 1, fill = "#fff", opacity = 1 }: { x: number; y: number; s?: number; fill?: string; opacity?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill} opacity={opacity}>
      <circle cx="-6" cy="1" r="4.6" />
      <circle cx="0" cy="-2" r="6.2" />
      <circle cx="6.6" cy="1" r="4.6" />
      <rect x="-10.6" y="0.6" width="21.2" height="5" rx="2.5" />
    </g>
  );
}

export function Moon({ x, y, s = 1, fill = "#f2d98a" }: { x: number; y: number; s?: number; fill?: string }) {
  return <path d="M5 -8 A8.5 8.5 0 1 0 5 8 A6.6 6.6 0 1 1 5 -8 Z" transform={`translate(${x} ${y}) scale(${s})`} fill={fill} />;
}

export function Sun({ x, y, r = 6, fill = "#f6b93b", ray = "#f6b93b", rays = 14 }: { x: number; y: number; r?: number; fill?: string; ray?: string; rays?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {Array.from({ length: rays }, (_, i) => (
        <rect key={i} x="-0.8" y={-r - 4.4} width="1.6" height="3.2" rx="0.8" fill={ray} transform={`rotate(${(360 / rays) * i})`} />
      ))}
      <circle r={r} fill={fill} />
    </g>
  );
}

export function Bear({ x, y, s = 1, fur = "#d9a877", belly = "#f1d3ae", accent = "#e0709a" }: { x: number; y: number; s?: number; fur?: string; belly?: string; accent?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="12" rx="8.2" ry="9" fill={fur} />
      <ellipse cx="0" cy="13" rx="5.2" ry="6.2" fill={belly} />
      <ellipse cx="-8.4" cy="9.5" rx="2.6" ry="4.2" fill={fur} transform="rotate(25 -8.4 9.5)" />
      <ellipse cx="8.4" cy="9.5" rx="2.6" ry="4.2" fill={fur} transform="rotate(-25 8.4 9.5)" />
      <ellipse cx="-4.8" cy="20.6" rx="3.2" ry="2.5" fill={fur} />
      <ellipse cx="4.8" cy="20.6" rx="3.2" ry="2.5" fill={fur} />
      <circle cx="-5.8" cy="-5.6" r="2.9" fill={fur} />
      <circle cx="5.8" cy="-5.6" r="2.9" fill={fur} />
      <circle cx="-5.8" cy="-5.6" r="1.5" fill={belly} />
      <circle cx="5.8" cy="-5.6" r="1.5" fill={belly} />
      <circle cx="0" cy="0" r="7.4" fill={fur} />
      <ellipse cx="0" cy="2.4" rx="3.6" ry="2.8" fill={belly} />
      <circle cx="-2.7" cy="-1.2" r="0.85" fill="#4a3426" />
      <circle cx="2.7" cy="-1.2" r="0.85" fill="#4a3426" />
      <ellipse cx="0" cy="1.5" rx="1.2" ry="0.85" fill="#4a3426" />
      <path d="M-1.4 3.6 Q0 4.8 1.4 3.6" fill="none" stroke="#4a3426" strokeWidth="0.45" strokeLinecap="round" />
      <path d="M0 7.6 L-3.6 6.2 L-3.6 9.6 Z M0 7.6 L3.6 6.2 L3.6 9.6 Z" fill={accent} />
      <circle cx="0" cy="7.8" r="1" fill={accent} />
    </g>
  );
}

export function Cross({ x, y, s = 1, fill = "#b8913a", glow }: { x: number; y: number; s?: number; fill?: string; glow?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {glow ? <circle r="12" fill={glow} /> : null}
      <rect x="-1.5" y="-10" width="3" height="21" rx="0.6" fill={fill} />
      <rect x="-5.2" y="-5.6" width="10.4" height="2.8" rx="0.6" fill={fill} />
      <rect x="-3.4" y="-9.6" width="6.8" height="1.7" rx="0.5" fill={fill} />
      <circle cx="0" cy="-1.6" r="1" fill="#fff" opacity="0.55" />
    </g>
  );
}

export function Dove({ x, y, s = 1, fill = "#ffffff", shade = "#dfe9f5", rot = 0 }: { x: number; y: number; s?: number; fill?: string; shade?: string; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M-9 3 L-16 5.5 L-15 1.8 L-9.5 1 Z" fill={shade} />
      <path d="M-9 3 C-6 -1.4 -1 -2.4 3 -1.8 C5 -4.6 8.4 -5.4 10 -3.8 C11 -2.8 10.4 -1.6 9.2 -1 C8.6 -0.6 8.4 0 8.6 0.9 C8.2 3.8 3 6.4 -3 6.2 C-6 6.1 -8 4.8 -9 3 Z" fill={fill} />
      <path d="M-2 -1 C-5 -10 -11 -12 -15.5 -10.5 C-12 -7.5 -10 -3 -7 2 Z" fill={shade} />
      <path d="M0 -1.4 C-1 -8 -5 -12.5 -9 -13.6 C-6.6 -9.6 -5.6 -5 -4.4 0 Z" fill={fill} />
      <circle cx="7.4" cy="-2.7" r="0.55" fill="#34455e" />
      <path d="M10.2 -3.4 L12.4 -2.7 L10.2 -2.1 Z" fill="#e0a060" />
    </g>
  );
}

export function Cap({ x, y, s = 1, board = "#1f2f4f", tassel = "#e3bf62", rot = 0 }: { x: number; y: number; s?: number; board?: string; tassel?: string; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M-7 1.6 V8 Q0 12.4 7 8 V1.6" fill={board} opacity="0.9" />
      <path d="M-15 0 L0 -6.5 L15 0 L0 6.5 Z" fill={board} />
      <path d="M-15 0 L0 -6.5 L15 0 L0 6.5 Z" fill="none" stroke={tassel} strokeWidth="0.5" />
      <circle cx="0" cy="0" r="1.2" fill={tassel} />
      <path d="M0 0 L11.4 2.6 V9.4" fill="none" stroke={tassel} strokeWidth="0.7" strokeLinecap="round" />
      <path d="M11.4 9.2 l-1 3.8 M11.4 9.2 l0 4.2 M11.4 9.2 l1 3.8" stroke={tassel} strokeWidth="0.7" strokeLinecap="round" />
    </g>
  );
}

export function Diploma({ x, y, s = 1, paper = "#fffaf0", ribbon = "#c0392b", rot = -20 }: { x: number; y: number; s?: number; paper?: string; ribbon?: string; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <rect x="-11" y="-3" width="22" height="6" rx="3" fill={paper} stroke="#d8c89a" strokeWidth="0.3" />
      <ellipse cx="-11" cy="0" rx="1.4" ry="3" fill="#efe3c0" />
      <ellipse cx="11" cy="0" rx="1.4" ry="3" fill="#efe3c0" />
      <rect x="-1.4" y="-3.2" width="2.8" height="6.4" fill={ribbon} />
      <path d="M0 3.2 l-2 4.4 l2 -1 l2 1 Z" fill={ribbon} />
    </g>
  );
}

export function Firework({ x, y, r = 9, color = "#f2c75c", rays = 12, dot = true }: { x: number; y: number; r?: number; color?: string; rays?: number; dot?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={color} strokeLinecap="round" strokeWidth="0.7">
      {Array.from({ length: rays }, (_, i) => {
        const a = ((360 / rays) * i * Math.PI) / 180;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        return (
          <g key={i}>
            <line x1={c * r * 0.32} y1={sn * r * 0.32} x2={c * r * 0.78} y2={sn * r * 0.78} />
            {dot ? <circle cx={c * r} cy={sn * r} r="0.7" fill={color} stroke="none" /> : null}
          </g>
        );
      })}
    </g>
  );
}

export function Glass({ x, y, s = 1, rot = 0, liquid = "#f2d98a", glass = "#ffffff" }: { x: number; y: number; s?: number; rot?: number; liquid?: string; glass?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M-3 -10 H3 L2.4 -2 Q0 1.4 -2.4 -2 Z" fill={glass} opacity="0.55" stroke={glass} strokeWidth="0.35" />
      <path d="M-2.7 -6.2 H2.7 L2.3 -2 Q0 1 -2.3 -2 Z" fill={liquid} />
      <rect x="-0.4" y="0.4" width="0.8" height="7.4" fill={glass} opacity="0.85" />
      <ellipse cx="0" cy="8" rx="3" ry="0.8" fill={glass} opacity="0.85" />
      <circle cx="-0.8" cy="-3.6" r="0.35" fill="#fff" />
      <circle cx="0.9" cy="-4.8" r="0.3" fill="#fff" />
    </g>
  );
}

export function Pencil({ x, y, s = 1, rot = 0, body = "#f2b632", band = "#c8ccd4" }: { x: number; y: number; s?: number; rot?: number; body?: string; band?: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <rect x="-1.7" y="-9" width="3.4" height="15" fill={body} />
      <rect x="-1.7" y="-9" width="1.2" height="15" fill="#fff" opacity="0.28" />
      <path d="M-1.7 6 L1.7 6 L0 10 Z" fill="#f0d2a0" />
      <path d="M-0.55 8.4 L0.55 8.4 L0 10 Z" fill="#4a4a4a" />
      <rect x="-1.7" y="-9" width="3.4" height="1.4" fill={band} />
      <rect x="-1.7" y="-11.2" width="3.4" height="2.2" rx="0.8" fill="#f08aa6" />
    </g>
  );
}

export function Apple({ x, y, s = 1, fill = "#d94b3d" }: { x: number; y: number; s?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -4 C-3 -6.4 -8 -4.4 -7.6 1.4 C-7.2 6.6 -3.6 9.6 -1.6 9 C-0.8 8.8 0 8.6 0 8.6 C0 8.6 0.8 8.8 1.6 9 C3.6 9.6 7.2 6.6 7.6 1.4 C8 -4.4 3 -6.4 0 -4 Z" fill={fill} />
      <path d="M0 -4 Q0.4 -7 2 -8.6" fill="none" stroke="#6b4a2f" strokeWidth="0.8" strokeLinecap="round" />
      <path d="M1 -6.6 C3 -9.6 6.4 -9 7 -8.4 C6 -6.2 3.4 -5.6 1 -6.6 Z" fill="#7fb069" />
      <ellipse cx="-3.2" cy="0" rx="1.1" ry="2" fill="#fff" opacity="0.3" transform="rotate(20 -3.2 0)" />
    </g>
  );
}

export function Book({ x, y, s = 1, cover = "#3f7fc4", pages = "#fffaf0", rot = 0 }: { x: number; y: number; s?: number; cover?: string; pages?: string; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <rect x="-8" y="-5.4" width="16" height="11" rx="0.9" fill={cover} />
      <rect x="-7" y="-4.6" width="14.4" height="9.4" rx="0.5" fill={pages} />
      <rect x="-8" y="-5.4" width="2.6" height="11" rx="0.9" fill={cover} />
      <rect x="-2.6" y="-2.4" width="6.6" height="0.8" fill={cover} opacity="0.55" />
      <rect x="-2.6" y="-0.6" width="5" height="0.8" fill={cover} opacity="0.55" />
    </g>
  );
}

export function Balloon({ x, y, color, tie }: { x: number; y: number; color: string; tie: [number, number] }) {
  return (
    <g>
      <path d={`M${x} ${y + 10.2} C${x - 2} ${y + 17} ${tie[0] + 2} ${tie[1] - 9} ${tie[0]} ${tie[1]}`} fill="none" stroke="#9a8f98" strokeWidth="0.3" />
      <ellipse cx={x} cy={y} rx="7.4" ry="9.2" fill={color} />
      <path d={`M${x - 1.3} ${y + 10.6} L${x + 1.3} ${y + 10.6} L${x} ${y + 9.1} Z`} fill={color} />
      <ellipse cx={x - 2.7} cy={y - 3.4} rx="1.5" ry="2.6" fill="#fff" opacity="0.45" transform={`rotate(-25 ${x - 2.7} ${y - 3.4})`} />
    </g>
  );
}

/** Triangular flags on a drooping string across the card. */
export function Bunting({ y = 4, sag = 5, colors, n = 11, size = 6.6 }: { y?: number; sag?: number; colors: string[]; n?: number; size?: number }) {
  const flags = Array.from({ length: n }, (_, i) => {
    const t = (i + 0.5) / n;
    const px = W * t;
    const py = y + 2 * sag * t * (1 - t);
    return { px, py, c: colors[i % colors.length] };
  });
  return (
    <g>
      <path d={`M0 ${y} Q${W / 2} ${y + 2 * sag} ${W} ${y}`} fill="none" stroke="#9a8f98" strokeWidth="0.3" />
      {flags.map((f, i) => (
        <path key={i} d={`M${f.px - size / 2} ${f.py} L${f.px + size / 2} ${f.py} L${f.px} ${f.py + size * 1.05} Z`} fill={f.c} />
      ))}
    </g>
  );
}

export type ConfettiShape = "r" | "c" | "t";
export const CONFETTI: [number, number, ConfettiShape, number][] = [
  [41, 6, "r", 20], [48, 12, "c", 0], [57, 5, "t", 40], [64, 11, "r", -30], [52, 20, "c", 0], [44, 24, "t", 10], [62, 23, "r", 60],
  [5, 52, "r", 30], [11, 62, "c", 0], [4, 74, "t", -20], [10, 88, "r", 50], [5, 100, "c", 0], [12, 112, "t", 25], [4, 124, "r", -40],
  [100, 55, "t", 15], [94, 66, "r", -25], [101, 80, "c", 0], [95, 92, "r", 35], [100, 104, "t", -10], [93, 116, "c", 0], [101, 126, "r", 45],
  [22, 138, "c", 0], [30, 132, "r", 20], [78, 133, "t", -15], [86, 139, "r", 50], [73, 142, "c", 0],
];

export function Confetti({ colors, only, items = CONFETTI }: { colors: string[]; only?: ConfettiShape; items?: typeof CONFETTI }) {
  return (
    <>
      {items
        .filter(([, , shape]) => !only || shape === only)
        .map(([x, y, shape, rot], i) => {
          const c = colors[i % colors.length];
          if (shape === "c") return <circle key={i} cx={x} cy={y} r="0.9" fill={c} />;
          if (shape === "t") return <path key={i} d="M0 -1.4 L1.3 1 L-1.3 1 Z" transform={`translate(${x} ${y}) rotate(${rot})`} fill={c} />;
          return <rect key={i} x="-1.3" y="-0.5" width="2.6" height="1" transform={`translate(${x} ${y}) rotate(${rot})`} fill={c} />;
        })}
    </>
  );
}

/** Mirrors a drawing onto the other corners of the card: flips and places it. */
export function Mirror({ h, v, children }: { h?: boolean; v?: boolean; children: ReactNode }) {
  const t = `translate(${h ? W : 0} ${v ? H : 0}) scale(${h ? -1 : 1} ${v ? -1 : 1})`;
  return <g transform={t}>{children}</g>;
}

/** All four corners from one drawing made for the top-left corner. */
export function Corners({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Mirror h>{children}</Mirror>
      <Mirror v>{children}</Mirror>
      <Mirror h v>
        {children}
      </Mirror>
    </>
  );
}
