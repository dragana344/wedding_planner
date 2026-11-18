import { Bg, Cap, Corners, Diamond, Diploma, Frame, Leaf } from "./primitives";

// Graduation: grown-up and calm. Thin gold lines, a laurel wreath, the cap and
// a diploma; no confetti and no scattered stars.

/** Three thin quarter-circle arcs round the top-left corner (an art-deco fan). */
function CornerFan({ stroke }: { stroke: string }) {
  return (
    <g fill="none" stroke={stroke} strokeWidth="0.35">
      {[6, 9, 12].map((r) => (
        <path key={r} d={`M4.5 ${4.5 + r} A${r} ${r} 0 0 0 ${4.5 + r} 4.5`} />
      ))}
    </g>
  );
}

/** Leaves along an arc, as half a laurel wreath (left side; mirror it for the right). */
function LaurelArc({ cx, cy, r, from, to, n, colors, size = 0.85 }: { cx: number; cy: number; r: number; from: number; to: number; n: number; colors: string[]; size?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const a = from + ((to - from) * i) / (n - 1);
        const rad = (a * Math.PI) / 180;
        const x = cx + r * Math.cos(rad);
        const y = cy + r * Math.sin(rad);
        const outward = a + 90;
        return (
          <g key={i}>
            <Leaf x={x} y={y} rot={outward - 25} s={size} fill={colors[i % colors.length]} />
            <Leaf x={x} y={y} rot={outward + 205} s={size * 0.8} fill={colors[(i + 1) % colors.length]} />
          </g>
        );
      })}
      <path d={`M${cx + r * Math.cos((from * Math.PI) / 180)} ${cy + r * Math.sin((from * Math.PI) / 180)} A${r} ${r} 0 0 ${to > from ? 1 : 0} ${cx + r * Math.cos((to * Math.PI) / 180)} ${cy + r * Math.sin((to * Math.PI) / 180)}`} fill="none" stroke={colors[0]} strokeWidth="0.4" />
    </g>
  );
}

export function GraduationNavy() {
  const gold = "#c9a24a";
  return (
    <>
      <Bg fill="#1b2a47" />
      <Frame double stroke={gold} inner="#7d6a3f" width={0.5} inset={4.5} gap={2.3} />
      <Corners>
        <CornerFan stroke={gold} />
        <Diamond x={4.5} y={4.5} fill={gold} />
      </Corners>
      <Cap x={52.5} y={20} s={1.15} board="#0e1830" tassel={gold} />
      <path d="M24 20 H36" stroke={gold} strokeWidth="0.35" />
      <path d="M69 20 H81" stroke={gold} strokeWidth="0.35" />
      <Diamond x={23} y={20} fill={gold} />
      <Diamond x={82} y={20} fill={gold} />
      <path d="M34 132 H71" stroke={gold} strokeWidth="0.35" />
      <Diamond x={52.5} y={132} fill={gold} />
      <Diploma x={52.5} y={138} s={0.9} rot={0} paper="#f3ead4" ribbon={gold} />
    </>
  );
}

/** An open book: two curved pages with a gold edge and a few lines of text. */
function OpenBook({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 -4 Q-9 -7.4 -19 -5 V8 Q-9 5.6 0 9 Z" fill="#f3ead4" stroke="#d9b85a" strokeWidth="0.5" />
      <path d="M0 -4 Q9 -7.4 19 -5 V8 Q9 5.6 0 9 Z" fill="#fbf4e2" stroke="#d9b85a" strokeWidth="0.5" />
      <path d="M-21 -4.4 V9.6 Q-9 7.2 0 10.6 Q9 7.2 21 9.6 V-4.4" fill="none" stroke="#d9b85a" strokeWidth="0.7" strokeLinejoin="round" />
      <path d="M0 -4 V10" stroke="#d9b85a" strokeWidth="0.4" />
      {[-1.6, 0.4, 2.4, 4.4].map((yy) => (
        <g key={yy} stroke="#b9a77a" strokeWidth="0.3">
          <path d={`M-16 ${yy - 1} Q-9 ${yy - 3} -3 ${yy - 0.4}`} fill="none" />
          <path d={`M3 ${yy - 0.4} Q9 ${yy - 3} 16 ${yy - 1}`} fill="none" />
        </g>
      ))}
    </g>
  );
}

export function GraduationForest() {
  const gold = "#d9b85a";
  return (
    <>
      <Bg fill="#1f3b2f" />
      <Frame double stroke={gold} inner="#8a8a52" width={0.5} inset={4.5} gap={2.3} />
      <Corners>
        <CornerFan stroke={gold} />
        <Diamond x={4.5} y={4.5} fill={gold} />
      </Corners>
      <Cap x={52.5} y={21} s={1.15} board="#0f2219" tassel={gold} />
      <path d="M24 21 H36" stroke={gold} strokeWidth="0.35" />
      <path d="M69 21 H81" stroke={gold} strokeWidth="0.35" />
      <Diamond x={23} y={21} fill={gold} />
      <Diamond x={82} y={21} fill={gold} />
      <OpenBook x={52.5} y={134} s={0.8} />
    </>
  );
}

export function GraduationBurgundy() {
  const gold = "#d9b85a";
  const laurel = ["#c9a24a", "#b8913a", "#e0c070"];
  return (
    <>
      <Bg fill="#5a2230" />
      <Frame double stroke={gold} inner="#9a7a4a" width={0.5} inset={4.5} gap={2.3} />
      <Corners>
        <CornerFan stroke={gold} />
        <Diamond x={4.5} y={4.5} fill={gold} />
      </Corners>
      <Cap x={52.5} y={21} s={1.15} board="#2e0f18" tassel={gold} />
      <path d="M24 21 H36" stroke={gold} strokeWidth="0.35" />
      <path d="M69 21 H81" stroke={gold} strokeWidth="0.35" />
      <Diamond x={23} y={21} fill={gold} />
      <Diamond x={82} y={21} fill={gold} />
      {/* A low laurel wreath round the diploma */}
      <g transform="translate(0 2)">
        <LaurelArc cx={52.5} cy={132} r={11} from={170} to={90} n={6} colors={laurel} size={0.8} />
        <g transform="translate(105 0) scale(-1 1)">
          <LaurelArc cx={52.5} cy={132} r={11} from={170} to={90} n={6} colors={laurel} size={0.8} />
        </g>
      </g>
      <Diploma x={52.5} y={132} s={0.85} rot={0} paper="#f3ead4" ribbon="#7a2a35" />
    </>
  );
}
