import { Bg, Bunting, Confetti, Corners, Daisy, Diamond, Firework, Frame, Glass, Heart, Leaf, Rose, Sparkle, Star, Sun, GREENS, W, H } from "./primitives";

// ---- Anniversary ---------------------------------------------------------

export function AnniversaryBurgundy() {
  const hearts: [number, number, number, string][] = [[9, 12, 1.3, "#9a2f4b"], [20, 8, 0.8, "#d9a441"], [8, 24, 0.8, "#d9a441"], [18, 20, 0.6, "#c85a73"]];
  return (
    <>
      <Bg fill="#fbf3ea" />
      <Frame double stroke="#b8913a" inner="#e2c9a0" width={0.55} inset={4.5} gap={2.3} />
      <Corners>
        {hearts.map(([x, y, s, f], i) => (
          <Heart key={i} x={x} y={y} s={s} fill={f} />
        ))}
      </Corners>
      {/* Two hearts side by side at the top */}
      <Heart x={47.5} y={18} s={1.6} fill="#9a2f4b" />
      <Heart x={58} y={20} s={1.3} fill="#d9a441" rot={10} />
      <path d="M30 22 H40" stroke="#e2c9a0" strokeWidth="0.35" />
      <path d="M66 22 H76" stroke="#e2c9a0" strokeWidth="0.35" />
      <Diamond x={29} y={22} />
      <Diamond x={77} y={22} />
      {[[10, 60, "#c85a73"], [95, 66, "#d9a441"], [9, 86, "#d9a441"], [96, 92, "#c85a73"], [11, 112, "#c85a73"], [94, 116, "#d9a441"]].map(([x, y, f], i) => (
        <Heart key={i} x={x as number} y={y as number} s={0.7} fill={f as string} />
      ))}
      <path d="M36 135 H69" stroke="#e2c9a0" strokeWidth="0.35" />
      <Heart x={52.5} y={133} s={0.7} fill="#9a2f4b" />
      <Heart x={44} y={135} s={0.4} fill="#d9a441" />
      <Heart x={61} y={135} s={0.4} fill="#d9a441" />
    </>
  );
}

export function AnniversarySilver() {
  return (
    <>
      <Bg fill="#f4f6f9" />
      <Frame double stroke="#9aa6bd" inner="#c5ccd9" width={0.55} inset={4.5} gap={2.3} />
      <Corners>
        <Diamond x={4.5} y={4.5} fill="#8a96b0" />
        <Star x={14} y={14} r={3} fill="#b8c2d6" />
        <Sparkle x={22} y={9} r={1.8} fill="#9aa6bd" />
        <Sparkle x={8} y={23} r={1.8} fill="#9aa6bd" />
      </Corners>
      {/* Two glasses touching, with a spark between them */}
      <Glass x={47} y={22} s={1.6} rot={-22} liquid="#e8d9a0" glass="#8f9bb5" />
      <Glass x={58} y={22} s={1.6} rot={22} liquid="#e8d9a0" glass="#8f9bb5" />
      <Sparkle x={52.5} y={7} r={3} fill="#f2c75c" />
      <Sparkle x={42} y={10} r={1.6} fill="#9aa6bd" />
      <Sparkle x={63} y={11} r={1.6} fill="#9aa6bd" />
      {[[10, 60], [95, 66], [9, 88], [96, 94], [11, 114], [94, 118]].map(([x, y], i) => (
        <Star key={i} x={x} y={y} r={i % 2 ? 2 : 2.8} fill="#b8c2d6" />
      ))}
      {[[16, 76], [89, 80], [17, 102], [88, 106]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.9" fill="#c5ccd9" />
      ))}
      <path d="M36 135 H69" stroke="#c5ccd9" strokeWidth="0.35" />
      <Diamond x={52.5} y={135} fill="#8a96b0" />
    </>
  );
}

export function AnniversaryBlush() {
  const cluster = (
    <g>
      {[[12, 22, 70], [20, 15, 20], [14, 30, 95], [6, 16, 250]].map(([x, y, r], i) => (
        <Leaf key={i} x={x} y={y} rot={r} fill={GREENS[i % 2]} />
      ))}
      <Rose x={11} y={11} s={1.2} />
      <Rose x={23} y={8} s={0.75} />
      <Rose x={8} y={25} s={0.75} />
    </g>
  );
  return (
    <>
      <Bg fill="#fdf1f0" />
      <rect x="3.5" y="3.5" width="98" height="141" rx="3" fill="none" stroke="#f0c8cb" strokeWidth="0.4" />
      {cluster}
      <g transform={`translate(${W} ${H}) scale(-0.9 -0.9)`}>{cluster}</g>
      <g transform={`translate(${W} 0) scale(-0.7 0.7)`}>{cluster}</g>
      <g transform={`translate(0 ${H}) scale(0.7 -0.7)`}>{cluster}</g>
      <Heart x={47} y={14} s={1.2} fill="#c9606e" />
      <Heart x={58} y={16} s={1} fill="#d9a441" rot={10} />
      {[[8, 66], [97, 72], [8, 92], [97, 98]].map(([x, y], i) => (
        <Heart key={i} x={x} y={y} s={0.6} fill={i % 2 ? "#d9a441" : "#e6b8b3"} />
      ))}
      <Heart x={52.5} y={139} s={0.7} fill="#c9606e" />
      <Heart x={45} y={141} s={0.4} fill="#e6b8b3" />
      <Heart x={60} y={141} s={0.4} fill="#e6b8b3" />
    </>
  );
}

// ---- Family --------------------------------------------------------------

function Grass({ y = 140, fill = "#8fbf6a" }: { y?: number; fill?: string }) {
  const blades = Array.from({ length: 36 }, (_, i) => {
    const x = (W / 36) * i + 1.4;
    const h = 5 + ((i * 7) % 5);
    return <path key={i} d={`M${x - 1.4} ${H} Q${x} ${H - h * 0.6} ${x - 0.6 + (i % 2 ? 1.4 : -1.4)} ${H - h - (H - y - 8)} L${x + 1.4} ${H} Z`} fill={fill} />;
  });
  return <g>{blades}</g>;
}

export function FamilySunny() {
  return (
    <>
      <Bg fill="#fffbe9" />
      <Sun x={16} y={16} r={8} fill="#f6b93b" ray="#f6c85f" />
      <Sun x={89} y={14} r={4} fill="#f9d36b" ray="#f9d36b" rays={10} />
      <Heart x={52.5} y={14} s={1.2} fill="#e8704f" />
      <Heart x={43} y={19} s={0.6} fill="#f6b93b" />
      <Heart x={62} y={19} s={0.6} fill="#f6b93b" />
      <Grass y={134} fill="#9bc86f" />
      {[[10, 130, 1.1], [24, 136, 0.8], [38, 139, 0.7], [67, 139, 0.7], [81, 136, 0.8], [95, 130, 1.1]].map(([x, y, s], i) => (
        <g key={i}>
          <path d={`M${x} ${y + 4} L${x} ${H}`} stroke="#6fa04a" strokeWidth="0.8" />
          <Daisy x={x} y={y} s={s * 1.3} petal="#f6c23e" center="#8a5a2b" petals={14} len={3.6} />
        </g>
      ))}
      {[[7, 60], [98, 66], [6, 88], [99, 94]].map(([x, y], i) => (
        <Daisy key={i} x={x} y={y} s={0.7} petal="#f6c23e" center="#8a5a2b" petals={12} />
      ))}
      <Sparkle x={30} y={25} r={2} fill="#f6b93b" />
      <Sparkle x={75} y={27} r={2.2} fill="#f6b93b" />
    </>
  );
}

export function FamilyGarden() {
  return (
    <>
      <Bg fill="#f3f8ee" />
      <Frame stroke="#c3dbb9" width={0.5} inset={3.5} />
      <Corners>
        {[[7, 8, 30], [14, 6, 10], [6, 16, 80], [20, 11, 340]].map(([x, y, r], i) => (
          <Leaf key={i} x={x} y={y} rot={r} fill={GREENS[i % 2]} s={1.1} />
        ))}
        <Daisy x={9} y={10} s={1.1} petal="#ffffff" center="#f2c75c" />
        <Daisy x={21} y={7} s={0.7} petal="#ffffff" center="#f2c75c" />
        <Daisy x={7} y={22} s={0.7} petal="#ffffff" center="#f2c75c" />
      </Corners>
      <Grass y={136} fill="#a5cf86" />
      {[[22, 134, 0.9], [34, 139, 0.7], [52.5, 138, 1.0], [71, 139, 0.7], [83, 134, 0.9]].map(([x, y, s], i) => (
        <g key={i}>
          <path d={`M${x} ${y + 3} L${x} ${H}`} stroke="#6fa04a" strokeWidth="0.7" />
          <Daisy x={x} y={y} s={s * 1.3} petal="#ffffff" center="#f2c75c" petals={12} />
        </g>
      ))}
      {[[8, 62], [97, 68], [8, 92], [97, 96]].map(([x, y], i) => (
        <Daisy key={i} x={x} y={y} s={0.6} petal="#ffffff" center="#f2c75c" />
      ))}
      <Heart x={52.5} y={22} s={1.1} fill="#e58aa2" />
    </>
  );
}

export function FamilyWarm() {
  const warm = ["#c4623a", "#e39a4a", "#a8452a", "#d9a441"];
  return (
    <>
      <Bg fill="#fbf1e8" />
      <Bunting y={2} sag={5} colors={warm} n={12} size={6.4} />
      <Corners>
        {[[7, 20, 70], [14, 14, 30], [8, 30, 100]].map(([x, y, r], i) => (
          <Leaf key={i} x={x} y={y} rot={r} fill={warm[i % 4]} s={1.1} />
        ))}
      </Corners>
      <Heart x={52.5} y={23} s={1.3} fill="#c4623a" />
      <Heart x={43} y={27} s={0.65} fill="#e39a4a" />
      <Heart x={62} y={27} s={0.65} fill="#e39a4a" />
      {[[8, 60], [97, 66], [7, 86], [98, 92], [9, 112], [96, 116]].map(([x, y], i) => (
        <g key={i}>
          <Leaf x={x} y={y} rot={i % 2 ? 150 : 30} fill={warm[i % 4]} s={1} />
          <Heart x={x + (i % 2 ? -3 : 3)} y={y - 6} s={0.4} fill={warm[(i + 1) % 4]} />
        </g>
      ))}
      <Heart x={52.5} y={139} s={0.8} fill="#c4623a" />
      <Heart x={44} y={141} s={0.45} fill="#e39a4a" />
      <Heart x={61} y={141} s={0.45} fill="#e39a4a" />
    </>
  );
}

// ---- New year ------------------------------------------------------------

export function NewYearMidnight() {
  return (
    <>
      <Bg fill="#14213d" />
      {[[10, 54], [95, 58], [8, 84], [98, 90], [12, 116], [93, 120], [22, 96], [86, 100]].map(([x, y], i) => (
        <Star key={i} x={x} y={y} r={i % 3 ? 1.4 : 2.2} fill={i % 2 ? "#f3ecd8" : "#f2c75c"} />
      ))}
      <Firework x={21} y={19} r={13} color="#f2c75c" />
      <Firework x={84} y={16} r={11} color="#f08fb0" />
      <Firework x={52.5} y={9} r={7} color="#8fd3f4" rays={10} />
      <Firework x={94} y={72} r={6} color="#f2c75c" rays={8} />
      <Firework x={11} y={70} r={6} color="#8fd3f4" rays={8} />
      <Sparkle x={34} y={26} r={2.4} fill="#f3ecd8" />
      <Sparkle x={72} y={30} r={2.4} fill="#f2c75c" />
      <Confetti colors={["#f2c75c", "#f08fb0", "#8fd3f4", "#f3ecd8"]} items={[[10, 130, "r", 20], [20, 138, "c", 0], [30, 134, "t", 30], [74, 134, "r", -20], [84, 139, "c", 0], [94, 130, "t", 10], [52.5, 142, "c", 0], [44, 140, "r", 50], [62, 141, "t", -40]]} />
      <Glass x={44} y={138} s={1.0} rot={-20} liquid="#f2c75c" glass="#d9dce6" />
      <Glass x={61} y={138} s={1.0} rot={20} liquid="#f2c75c" glass="#d9dce6" />
      <Sparkle x={52.5} y={131} r={2} fill="#f2c75c" />
    </>
  );
}

export function NewYearSilver() {
  return (
    <>
      <Bg fill="#1b1b1f" />
      <Frame double stroke="#d6d8e0" inner="#6b6d78" width={0.5} inset={4.5} gap={2.3} />
      <Corners>
        <Diamond x={4.5} y={4.5} fill="#d6d8e0" />
        <Star x={13} y={13} r={3} fill="#d6d8e0" />
        <Sparkle x={22} y={9} r={1.8} fill="#9a9cab" />
        <Sparkle x={8} y={23} r={1.8} fill="#9a9cab" />
      </Corners>
      <Glass x={46} y={20} s={1.8} rot={-22} liquid="#e9d9a0" glass="#d6d8e0" />
      <Glass x={59} y={20} s={1.8} rot={22} liquid="#e9d9a0" glass="#d6d8e0" />
      <Sparkle x={52.5} y={7} r={3.2} fill="#f2e2a0" />
      <Sparkle x={40} y={11} r={1.8} fill="#d6d8e0" />
      <Sparkle x={66} y={12} r={1.8} fill="#d6d8e0" />
      {[[10, 60], [95, 66], [9, 88], [96, 94], [11, 114], [94, 118]].map(([x, y], i) => (
        <Star key={i} x={x} y={y} r={i % 2 ? 1.8 : 2.6} fill={i % 2 ? "#9a9cab" : "#d6d8e0"} />
      ))}
      <Confetti colors={["#d6d8e0", "#9a9cab", "#f2e2a0"]} items={[[16, 74, "c", 0], [88, 78, "t", 20], [17, 100, "r", 30], [89, 106, "c", 0], [24, 132, "r", -20], [80, 133, "t", 40]]} />
      <path d="M36 135 H69" stroke="#6b6d78" strokeWidth="0.35" />
      <Diamond x={52.5} y={135} fill="#d6d8e0" />
    </>
  );
}

export function NewYearFestive() {
  const baubles: [number, number, number, string][] = [[14, 20, 6, "#c0392b"], [28, 12, 4.6, "#f2c75c"], [78, 11, 4.6, "#f2c75c"], [92, 21, 6, "#c0392b"], [52.5, 9, 4, "#e8e0c8"]];
  return (
    <>
      <Bg fill="#17402f" />
      <Frame stroke="#f2c75c" width={0.5} inset={3.5} />
      {baubles.map(([x, y, r, c], i) => (
        <g key={i}>
          <path d={`M${x} 0 V${y - r}`} stroke="#f2c75c" strokeWidth="0.35" />
          <rect x={x - 1.2} y={y - r - 1.4} width="2.4" height="1.6" fill="#f2c75c" />
          <circle cx={x} cy={y} r={r} fill={c} />
          <ellipse cx={x - r * 0.35} cy={y - r * 0.35} rx={r * 0.22} ry={r * 0.36} fill="#fff" opacity="0.35" />
          <path d={`M${x - r} ${y} Q${x} ${y + r * 0.5} ${x + r} ${y}`} fill="none" stroke="#f2c75c" strokeWidth="0.4" opacity="0.8" />
        </g>
      ))}
      {[[9, 56], [96, 62], [8, 82], [97, 88], [11, 108], [94, 112]].map(([x, y], i) => (
        <Star key={i} x={x} y={y} r={i % 2 ? 2 : 2.8} fill="#f2c75c" />
      ))}
      <Sparkle x={26} y={34} r={2} fill="#f6eed8" />
      <Sparkle x={80} y={34} r={2} fill="#f6eed8" />
      {/* Holly in the bottom corners */}
      {[0, 1].map((side) => (
        <g key={side} transform={side ? `translate(${W} 0) scale(-1 1)` : undefined}>
          <Leaf x={10} y={138} rot={-40} fill="#2f7a4f" s={1.7} />
          <Leaf x={10} y={138} rot={-100} fill="#3f9a63" s={1.7} />
          <Leaf x={10} y={138} rot={-160} fill="#2f7a4f" s={1.5} />
          <circle cx="11" cy="137" r="1.7" fill="#c0392b" />
          <circle cx="14" cy="139" r="1.6" fill="#c0392b" />
          <circle cx="9" cy="140" r="1.5" fill="#c0392b" />
        </g>
      ))}
      <Confetti colors={["#f2c75c", "#c0392b", "#f6eed8"]} items={[[32, 132, "r", 20], [40, 140, "c", 0], [66, 140, "t", 30], [74, 133, "r", -30], [52.5, 142, "c", 0]]} />
    </>
  );
}
