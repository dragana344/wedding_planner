import { Bg, Corners, Diamond, Flower, Frame, Heart, Leaf, Rose, Sprig, GREENS, W, H } from "./primitives";

const GOLDS = ["#c9a24a", "#b8913a"];

export function WeddingElegant() {
  return (
    <>
      <Bg fill="#fffdf8" />
      <Frame double stroke="#b8913a" inner="#d9c79a" width={0.55} inset={4.5} gap={2.3} />
      <Corners>
        <Diamond x={4.5} y={4.5} />
        {/* A small gold sprig in each corner, inside the frame */}
        <g transform="translate(9.5 9.5) rotate(22)">
          <Sprig scale={0.5} colors={GOLDS} stem="#b8913a" />
        </g>
        <g transform="translate(9.5 9.5) rotate(68)">
          <Sprig scale={0.5} colors={GOLDS} stem="#b8913a" />
        </g>
        <Flower x={10} y={10} r={0.8} petal="#f3e3bd" center="#b8913a" />
      </Corners>
      {/* Two small rings with a line and a diamond on each side */}
      <g transform="translate(52.5 17)">
        <circle cx="-2.7" r="4.8" fill="none" stroke="#b8913a" strokeWidth="1.1" />
        <circle cx="2.7" r="4.8" fill="none" stroke="#c9a24a" strokeWidth="1.1" />
      </g>
      <path d="M26 17 H41" stroke="#d9c79a" strokeWidth="0.35" />
      <path d="M64 17 H79 " stroke="#d9c79a" strokeWidth="0.35" />
      <Diamond x={25} y={17} />
      <Diamond x={80} y={17} />
      <path d="M33 21.6 H72" stroke="#ecdfb8" strokeWidth="0.25" />
      {/* Bottom: a line, a diamond and two small hearts */}
      <path d="M36 135 H69" stroke="#d9c79a" strokeWidth="0.35" />
      <Diamond x={52.5} y={135} />
      <Heart x={44.5} y={131.6} s={0.32} fill="#e6c9a6" />
      <Heart x={60.5} y={131.6} s={0.32} fill="#e6c9a6" />
      {/* A few small gold dots down each side */}
      {[52, 64, 76, 88, 100].map((y) => (
        <g key={y}>
          <circle cx="11" cy={y} r="0.5" fill="#d9c79a" />
          <circle cx="94" cy={y} r="0.5" fill="#d9c79a" />
        </g>
      ))}
    </>
  );
}

export function WeddingForever() {
  return (
    <>
      <Bg fill="#fbf6ea" />
      <Frame inset={3} stroke="#d9c79a" width={0.35} />
      <Corners>
        <g transform="translate(2 3) rotate(10)">
          <Sprig scale={0.8} />
        </g>
        <g transform="translate(2 3) rotate(80)">
          <Sprig scale={0.8} />
        </g>
        <Flower x={6} y={6} r={1.35} />
        <Flower x={21} y={5.5} r={0.7} />
        <Flower x={5.5} y={21} r={0.7} />
      </Corners>
      <g transform="translate(52.5 17)">
        <circle cx="-3.4" r="6.2" fill="none" stroke="#b8913a" strokeWidth="1.5" />
        <circle cx="3.4" r="6.2" fill="none" stroke="#c9a24a" strokeWidth="1.5" />
        <Heart x={0} y={-10.5} s={0.85} fill="#e6b8b3" stroke="#b8913a" />
      </g>
      {/* Little flowers and leaves climbing the sides */}
      {[[7.5, 62], [97.5, 70], [7, 92], [98, 100]].map(([x, y], i) => (
        <g key={i}>
          <Leaf x={x} y={y + 6} rot={i % 2 ? 150 : 30} fill={GREENS[i % 2]} s={0.8} />
          <Flower x={x} y={y} r={0.55} />
        </g>
      ))}
      <Heart x={45} y={138.5} s={0.45} fill="#e6b8b3" />
      <Heart x={52.5} y={137.5} s={0.7} fill="#c9a24a" />
      <Heart x={60} y={138.5} s={0.45} fill="#e6b8b3" />
    </>
  );
}

export function WeddingRomantic() {
  const topLeft = (
    <g>
      {[[12, 22, 70], [20, 15, 20], [14, 30, 95], [6, 16, 250], [24, 8, 340]].map(([x, y, r], i) => (
        <Leaf key={i} x={x} y={y} rot={r} fill={GREENS[i % 2]} />
      ))}
      <Rose x={11} y={11} s={1.25} />
      <Rose x={24} y={8} s={0.85} />
      <Rose x={8} y={26} s={0.8} />
    </g>
  );
  return (
    <>
      <Bg fill="#fdf1f0" />
      <rect x="3.5" y="3.5" width="98" height="141" rx="3" fill="none" stroke="#f0c8cb" strokeWidth="0.4" />
      {topLeft}
      <g transform={`translate(${W} ${H}) scale(-0.82 -0.82)`}>{topLeft}</g>
      <g>
        {[[94, 18, 160], [86, 12, 200], [99, 26, 110]].map(([x, y, r], i) => (
          <Leaf key={i} x={x} y={y} rot={r} fill={GREENS[i % 2]} />
        ))}
        <Rose x={95} y={10} s={0.95} />
        <Rose x={99} y={28} s={0.55} />
      </g>
      <g>
        {[[11, 130, 20], [19, 136, 340], [6, 122, 280]].map(([x, y, r], i) => (
          <Leaf key={i} x={x} y={y} rot={r} fill={GREENS[i % 2]} />
        ))}
        <Rose x={10} y={138} s={0.95} />
        <Rose x={6} y={120} s={0.5} />
      </g>
      {/* Small roses and leaves along both sides */}
      {[[6.5, 66], [98.5, 74], [6.5, 94], [98.5, 102]].map(([x, y], i) => (
        <g key={i}>
          <Leaf x={x} y={y + 5} rot={i % 2 ? 160 : 20} fill={GREENS[i % 2]} s={0.8} />
          <Leaf x={x} y={y - 5} rot={i % 2 ? 200 : 340} fill={GREENS[(i + 1) % 2]} s={0.8} />
          <Rose x={x} y={y} s={0.42} />
        </g>
      ))}
      {/* Hearts and a few petals */}
      <Heart x={52.5} y={12} s={1} fill="#d9a441" />
      <Heart x={43.5} y={16} s={0.55} />
      <Heart x={61.5} y={16} s={0.55} />
      <Heart x={52.5} y={139} s={0.7} fill="#d9a441" />
      <Heart x={45} y={141} s={0.4} />
      <Heart x={60} y={141} s={0.4} />
      {[[34, 8, 20], [72, 9, -30], [30, 30, 50], [76, 32, -10], [28, 122, 30], [78, 124, -40]].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx="1.4" ry="0.8" fill="#f3c3c6" transform={`rotate(${r} ${x} ${y})`} />
      ))}
    </>
  );
}
