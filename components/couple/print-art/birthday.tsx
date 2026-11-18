import { Balloon, Bg, Bunting, Confetti, Frame, Sparkle, Star, CONFETTI } from "./primitives";

export interface BirthdayPalette {
  bg: string;
  balloons: [string, string, string, string];
  cake: string;
  frosting: string;
  confetti: string[];
  string: string;
}

export const BIRTHDAY_PALETTES: Record<"pink" | "blue" | "neutral", BirthdayPalette> = {
  pink: { bg: "#fff5f8", balloons: ["#ec6f9a", "#f7a8c4", "#ffd36b", "#8fd3c8"], cake: "#fde3ec", frosting: "#f7a8c4", confetti: ["#ec6f9a", "#ffd36b", "#8fd3c8", "#f7a8c4"], string: "#9a8f98" },
  blue: { bg: "#f1f8ff", balloons: ["#4c9be8", "#9ecbf5", "#ffd36b", "#f7a8c4"], cake: "#e3f0fd", frosting: "#9ecbf5", confetti: ["#4c9be8", "#ffd36b", "#f7a8c4", "#9ecbf5"], string: "#9a8f98" },
  neutral: { bg: "#fbf8f2", balloons: ["#d9a441", "#e9d5a5", "#8fae86", "#c9b8a6"], cake: "#f5ecdc", frosting: "#e9d5a5", confetti: ["#d9a441", "#8fae86", "#c9b8a6", "#e9d5a5"], string: "#9a8f98" },
};

export function BirthdayBalloons({ palette, elegant = false }: { palette: keyof typeof BIRTHDAY_PALETTES; elegant?: boolean }) {
  const p = BIRTHDAY_PALETTES[palette];
  const [b1, b2, b3, b4] = p.balloons;
  const left: [number, number, string][] = elegant ? [[13, 18, b1], [25.5, 12.5, b2], [23, 27, b3]] : [[13, 18, b1], [25.5, 12.5, b2], [23, 27, b3], [10.5, 33, b4]];
  const right: [number, number, string][] = elegant ? [[92, 18, b3], [79.5, 12.5, b1], [82, 27, b2]] : [[92, 18, b3], [79.5, 12.5, b1], [82, 27, b4], [94.5, 33, b2]];
  const leftTie: [number, number] = [19, 47];
  const rightTie: [number, number] = [86, 47];
  const confetti = elegant ? CONFETTI.filter(([, , shape]) => shape === "c") : CONFETTI;
  return (
    <>
      <Bg fill={p.bg} />
      {elegant ? <Frame stroke="#b8913a" width={0.45} /> : null}
      <Confetti colors={p.confetti} items={confetti} />
      {/* Bunting across the top, and little stars */}
      <Bunting y={2.5} sag={4.5} colors={elegant ? ["#e9d5a5", "#d9a441", "#8fae86"] : p.balloons} n={12} size={6} />
      {[[42, 26, 1.8], [64, 29, 1.5], [49, 21, 1.2], [58, 17, 1.2]].map(([x, y, r], i) => (
        <Star key={i} x={x} y={y} r={r} fill={p.balloons[(i + 2) % 4]} />
      ))}
      <Sparkle x={36} y={14} r={2} fill={p.balloons[2]} />
      <Sparkle x={69} y={17} r={2.2} fill={p.balloons[0]} />
      <g transform="translate(0 -4)">
        {left.map(([x, y, c], i) => (
          <Balloon key={`l${i}`} x={x} y={y} color={c} tie={leftTie} />
        ))}
        {right.map(([x, y, c], i) => (
          <Balloon key={`r${i}`} x={x} y={y} color={c} tie={rightTie} />
        ))}
        {[leftTie, rightTie].map(([x, y], i) => (
          <path key={i} d={`M${x} ${y} l-2.6 -1.6 l0 3.2 Z M${x} ${y} l2.6 -1.6 l0 3.2 Z`} fill={b1} />
        ))}
      </g>
      {/* A few more balloons low on the sides, and the cake */}
      <g transform="translate(0 100) scale(0.55)">
        <Balloon x={12} y={20} color={b2} tie={[18, 52]} />
        <Balloon x={26} y={14} color={b3} tie={[18, 52]} />
      </g>
      <g transform="translate(105 100) scale(-0.55 0.55)">
        <Balloon x={12} y={20} color={b3} tie={[18, 52]} />
        <Balloon x={26} y={14} color={b2} tie={[18, 52]} />
      </g>
      <g transform="translate(52.5 148) scale(0.78) translate(-52.5 -148)">
        <ellipse cx="52.5" cy="144.6" rx="17.5" ry="2.2" fill="#e8dfe3" />
        <rect x="41.5" y="134.5" width="22" height="10" rx="1.6" fill={p.cake} />
        <path d="M41.5 134.5 q2.75 4.2 5.5 0 q2.75 4.2 5.5 0 q2.75 4.2 5.5 0 q2.75 4.2 5.5 0 V133 q0 -1.5 -1.5 -1.5 H43 q-1.5 0 -1.5 1.5 Z" fill={p.frosting} />
        <rect x="46.5" y="127" width="12" height="7" rx="1.2" fill={p.cake} />
        <path d="M46.5 130.2 q2 3.2 4 0 q2 3.2 4 0 q2 3.2 4 0 V128.2 q0 -1.2 -1.2 -1.2 H47.7 q-1.2 0 -1.2 1.2 Z" fill={p.frosting} />
        <rect x="51.9" y="121.8" width="1.2" height="5.4" fill={p.balloons[0]} />
        <path d="M52.5 117.2 C51 119.4 51.2 121.2 52.5 121.4 C53.8 121.2 54 119.4 52.5 117.2 Z" fill="#ffc93c" />
        {[44, 48.5, 56.5, 61].map((x, i) => (
          <circle key={i} cx={x} cy={139.5 + (i % 2) * 2} r="0.55" fill={p.confetti[i % p.confetti.length]} />
        ))}
      </g>
    </>
  );
}
