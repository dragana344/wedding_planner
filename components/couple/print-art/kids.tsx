import { Bear, Bg, Cloud, Cross, Diamond, Dove, Frame, Heart, Moon, Sparkle, Star, Sprig, Leaf } from "./primitives";

type Tone = "pink" | "blue" | "neutral";

const BABY: Record<Tone, { bg: string; cloud: string; cloud2: string; accent: string; star: string; fur: string; belly: string; bear: string }> = {
  pink: { bg: "#fff4f7", cloud: "#ffffff", cloud2: "#fbd5e1", accent: "#f08fb0", star: "#f7c75c", fur: "#d9a877", belly: "#f1d3ae", bear: "#e0709a" },
  blue: { bg: "#f0f7ff", cloud: "#ffffff", cloud2: "#cfe3f8", accent: "#6ea8e8", star: "#f7c75c", fur: "#d9a877", belly: "#f1d3ae", bear: "#4c8fd6" },
  neutral: { bg: "#fbf8f2", cloud: "#ffffff", cloud2: "#ece4cf", accent: "#a8b890", star: "#e0c277", fur: "#d3b18a", belly: "#efdcc0", bear: "#8a9a7a" },
};

export function BabyShower({ tone }: { tone: Tone }) {
  const t = BABY[tone];
  return (
    <>
      <Bg fill={t.bg} />
      <Frame stroke={t.cloud2} width={0.5} inset={3.5} />
      {/* Clouds across the top and at the corners */}
      <Cloud x={16} y={16} s={1.3} fill={t.cloud2} />
      <Cloud x={89} y={14} s={1.15} fill={t.cloud2} />
      <Cloud x={30} y={9} s={0.9} fill={t.cloud} />
      <Cloud x={76} y={22} s={0.8} fill={t.cloud} />
      <Cloud x={9} y={36} s={0.85} fill={t.cloud} />
      <Cloud x={95} y={40} s={0.85} fill={t.cloud} />
      {tone === "neutral" ? <Moon x={52.5} y={14} s={1.1} fill="#f2d98a" /> : null}
      {tone === "pink" ? (
        <>
          <Heart x={52.5} y={11} s={1.1} fill={t.accent} />
          <Heart x={44} y={16} s={0.55} fill="#f8bfd2" />
          <Heart x={61} y={16} s={0.55} fill="#f8bfd2" />
        </>
      ) : null}
      {tone === "blue" ? (
        <>
          <Star x={52.5} y={13} r={4} fill={t.star} />
          <Star x={44} y={18} r={2} fill="#bcd9f6" />
          <Star x={61} y={18} r={2} fill="#bcd9f6" />
        </>
      ) : null}
      {/* Stars down the sides and between the clouds */}
      {[[9, 58], [97, 62], [7, 80], [98, 86], [10, 104], [95, 108], [38, 28], [68, 30]].map(([x, y], i) => (
        <Star key={i} x={x} y={y} r={i % 2 ? 2 : 2.8} fill={i % 3 === 0 ? t.star : t.accent} />
      ))}
      <Sparkle x={24} y={54} r={2} fill={t.star} />
      <Sparkle x={82} y={52} r={2.2} fill={t.star} />
      {/* Clouds and a teddy at the bottom */}
      <Cloud x={20} y={135} s={1.2} fill={t.cloud2} />
      <Cloud x={86} y={136} s={1.2} fill={t.cloud2} />
      <Cloud x={34} y={141} s={0.8} fill={t.cloud} />
      <Cloud x={73} y={142} s={0.8} fill={t.cloud} />
      <Bear x={52.5} y={133} s={0.58} fur={t.fur} belly={t.belly} accent={t.bear} />
    </>
  );
}

const SKY: Record<"blue" | "pink", { bg: string; cloud: string; cloud2: string; dove: string; shade: string; ray: string; gold: string }> = {
  blue: { bg: "#f0f7ff", cloud: "#ffffff", cloud2: "#cfe3f8", dove: "#ffffff", shade: "#d6e6f7", ray: "#dcecfb", gold: "#e0b24c" },
  pink: { bg: "#fff4f7", cloud: "#ffffff", cloud2: "#fbd5e1", dove: "#ffffff", shade: "#f6dbe6", ray: "#fde3ec", gold: "#e0b24c" },
};

export function BaptismDove({ tone }: { tone: "blue" | "pink" }) {
  const t = SKY[tone];
  return (
    <>
      <Bg fill={t.bg} />
      <Frame stroke={t.cloud2} width={0.5} inset={3.5} />
      <Cloud x={17} y={28} s={1.4} fill={t.cloud2} />
      <Cloud x={89} y={30} s={1.3} fill={t.cloud2} />
      <Cloud x={29} y={36} s={0.9} fill={t.cloud} />
      <Cloud x={77} y={38} s={0.9} fill={t.cloud} />
      <Dove x={52.5} y={24} s={1.1} fill={t.dove} shade={t.shade} />
      {[[10, 56], [96, 60], [8, 84], [97, 90], [11, 112], [94, 116]].map(([x, y], i) => (
        <Star key={i} x={x} y={y} r={i % 2 ? 2 : 2.8} fill={i % 2 ? "#f7d98a" : t.gold} />
      ))}
      <Sparkle x={22} y={64} r={2} fill={t.gold} />
      <Sparkle x={84} y={70} r={2.2} fill={t.gold} />
      <Cloud x={18} y={136} s={1.3} fill={t.cloud2} />
      <Cloud x={88} y={137} s={1.3} fill={t.cloud2} />
      <Cloud x={32} y={142} s={0.85} fill={t.cloud} />
      <Cloud x={74} y={143} s={0.85} fill={t.cloud} />
      <Dove x={14} y={100} s={0.6} fill={t.dove} shade={t.shade} rot={-12} />
      <Dove x={92} y={96} s={0.6} fill={t.dove} shade={t.shade} rot={10} />
    </>
  );
}

export function BaptismGold() {
  const olive = ["#8fae86", "#6f9a6a", "#a9bf9f"];
  return (
    <>
      <Bg fill="#fffcf4" />
      <Frame double stroke="#b8913a" inner="#e0cf9f" width={0.55} inset={4.5} gap={2.3} />
      {[[4.5, 4.5], [100.5, 4.5], [4.5, 143.5], [100.5, 143.5]].map(([x, y], i) => (
        <Diamond key={i} x={x} y={y} />
      ))}
      <Cross x={52.5} y={19} s={1.3} fill="#b8913a" glow="#f6ecd0" />
      {[[-1, 0], [1, 0]].map(([dir], i) => (
        <g key={i} transform={`translate(${dir === -1 ? 41 : 64} 27) scale(${dir} 1) rotate(-8)`}>
          <Sprig scale={0.62} colors={olive} stem="#6f9a6a" />
        </g>
      ))}
      <path d="M36 135 H69" stroke="#d9c79a" strokeWidth="0.35" />
      <Diamond x={52.5} y={135} />
      {/* Olive branches rising from the bottom corners */}
      <g transform="translate(9 137) rotate(-62)">
        <Sprig scale={0.85} colors={olive} stem="#6f9a6a" />
      </g>
      <g transform="translate(96 137) scale(-1 1) rotate(-62)">
        <Sprig scale={0.85} colors={olive} stem="#6f9a6a" />
      </g>
      <g transform="translate(9 12) rotate(62)">
        <Sprig scale={0.55} colors={olive} stem="#6f9a6a" />
      </g>
      <g transform="translate(96 12) scale(-1 1) rotate(62)">
        <Sprig scale={0.55} colors={olive} stem="#6f9a6a" />
      </g>
      {[[12, 70], [93, 76], [12, 96], [93, 102]].map(([x, y], i) => (
        <Leaf key={i} x={x} y={y} rot={i % 2 ? 150 : 30} fill={olive[i % 3]} s={0.9} />
      ))}
      {[[22, 58], [84, 60], [22, 112], [84, 116]].map(([x, y], i) => (
        <Sparkle key={i} x={x} y={y} r={1.8} fill="#d9b85a" />
      ))}
    </>
  );
}
