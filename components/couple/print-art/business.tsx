import { Bg, Diamond, Frame, Sparkle, Star, W, H } from "./primitives";

export function BusinessNavy() {
  return (
    <>
      <Bg fill="#fbfbfd" />
      {/* Navy corner blocks with a gold edge, top-left and bottom-right */}
      <path d="M0 0 H44 L0 38 Z" fill="#243556" />
      <path d="M0 38 L44 0 L48 0 L0 42 Z" fill="#c9a24a" />
      <path d="M0 0 H30 L0 26 Z" fill="#33497a" />
      <g transform={`translate(${W} ${H}) rotate(180)`}>
        <path d="M0 0 H44 L0 38 Z" fill="#243556" />
        <path d="M0 38 L44 0 L48 0 L0 42 Z" fill="#c9a24a" />
        <path d="M0 0 H30 L0 26 Z" fill="#33497a" />
      </g>
      <path d="M105 0 H78 L105 24 Z" fill="#eef0f6" />
      <path d="M0 148 H27 L0 124 Z" fill="#eef0f6" />
      <Frame stroke="#d9dde8" width={0.35} inset={5} />
      {[[90, 72], [92, 80], [94, 88], [12, 92], [14, 100], [16, 108]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.8" fill="#c9a24a" />
      ))}
      <Diamond x={52.5} y={19} r={1.4} fill="#c9a24a" />
      <path d="M36 19 H49" stroke="#c9a24a" strokeWidth="0.4" />
      <path d="M56 19 H69" stroke="#c9a24a" strokeWidth="0.4" />
    </>
  );
}

export function BusinessTeal() {
  return (
    <>
      <Bg fill="#f2f9f8" />
      {/* Overlapping soft circles */}
      <circle cx="98" cy="8" r="30" fill="#15858c" opacity="0.18" />
      <circle cx="90" cy="16" r="20" fill="#15858c" opacity="0.28" />
      <circle cx="100" cy="4" r="9" fill="#15858c" />
      <circle cx="4" cy="144" r="24" fill="#15858c" opacity="0.18" />
      <circle cx="9" cy="140" r="15" fill="#15858c" opacity="0.28" />
      <circle cx="3" cy="146" r="7" fill="#15858c" />
      {/* Dot grid */}
      {Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) => <circle key={`a${r}${c}`} cx={9 + c * 4.2} cy={9 + r * 4.2} r="0.7" fill="#15858c" opacity="0.55" />),
      )}
      {Array.from({ length: 5 }, (_, r) =>
        Array.from({ length: 5 }, (_, c) => <circle key={`b${r}${c}`} cx={85 + c * 4.2} cy={127 + r * 4.2} r="0.7" fill="#15858c" opacity="0.55" />),
      )}
      <path d="M36 19 H69" stroke="#15858c" strokeWidth="0.5" />
      <circle cx="52.5" cy="19" r="1.6" fill="#15858c" />
    </>
  );
}

export function BusinessGraphite() {
  return (
    <>
      <Bg fill="#2c2f36" />
      <Frame stroke="#e0a070" width={0.4} inset={4.5} />
      {/* Fine diagonal lines in two corners */}
      {Array.from({ length: 8 }, (_, i) => (
        <path key={`a${i}`} d={`M${4.5 + i * 3.4} 4.5 L4.5 ${4.5 + i * 3.4}`} stroke="#e0a070" strokeWidth="0.3" opacity="0.8" />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <path key={`b${i}`} d={`M${100.5 - i * 3.4} 143.5 L100.5 ${143.5 - i * 3.4}`} stroke="#e0a070" strokeWidth="0.3" opacity="0.8" />
      ))}
      <circle cx="88" cy="26" r="9" fill="none" stroke="#e0a070" strokeWidth="0.4" />
      <circle cx="88" cy="26" r="5" fill="none" stroke="#e0a070" strokeWidth="0.3" opacity="0.6" />
      <circle cx="14" cy="130" r="7" fill="none" stroke="#e0a070" strokeWidth="0.4" />
      <circle cx="14" cy="130" r="3.8" fill="none" stroke="#e0a070" strokeWidth="0.3" opacity="0.6" />
      <Diamond x={52.5} y={19} r={1.4} fill="#e0a070" />
      <path d="M36 19 H49" stroke="#e0a070" strokeWidth="0.4" />
      <path d="M56 19 H69" stroke="#e0a070" strokeWidth="0.4" />
      <Star x={12} y={74} r={1.6} fill="#e0a070" />
      <Star x={93} y={74} r={1.6} fill="#e0a070" />
      <Sparkle x={52.5} y={134} r={2.2} fill="#e0a070" />
    </>
  );
}

export function OtherElegant() {
  return (
    <>
      <Bg fill="#fffdf8" />
      <Frame double stroke="#b8913a" inner="#d9c79a" width={0.55} inset={4.5} gap={2.3} />
      {[[4.5, 4.5], [100.5, 4.5], [4.5, 143.5], [100.5, 143.5]].map(([x, y], i) => (
        <Diamond key={i} x={x} y={y} />
      ))}
      <Star x={52.5} y={17} r={5} fill="#c9a24a" />
      <path d="M26 17 H43" stroke="#d9c79a" strokeWidth="0.35" />
      <path d="M62 17 H79" stroke="#d9c79a" strokeWidth="0.35" />
      <Diamond x={25} y={17} />
      <Diamond x={80} y={17} />
      <path d="M36 135 H69" stroke="#d9c79a" strokeWidth="0.35" />
      <Diamond x={52.5} y={135} />
      <Sparkle x={40} y={130} r={1.6} fill="#c9a24a" />
      <Sparkle x={65} y={130} r={1.6} fill="#c9a24a" />
      {[52, 64, 76, 88, 100].map((y) => (
        <g key={y}>
          <circle cx="11" cy={y} r="0.5" fill="#d9c79a" />
          <circle cx="94" cy={y} r="0.5" fill="#d9c79a" />
        </g>
      ))}
    </>
  );
}
