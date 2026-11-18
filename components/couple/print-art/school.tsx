import { Apple, Bg, Book, Confetti, Frame, Pencil, Sparkle, Star } from "./primitives";

const PENCIL_COLORS = ["#f2b632", "#e0663a", "#3f9acb", "#6fb06a", "#c05fb0"];

export function SchoolPencils() {
  return (
    <>
      <Bg fill="#fffaf0" />
      <Frame stroke="#f4cf9c" width={0.5} inset={3.5} />
      {/* A fan of pencils in the top corners */}
      {[0, 1].map((side) => (
        <g key={side} transform={side ? "translate(105 0) scale(-1 1)" : undefined}>
          {PENCIL_COLORS.map((c, i) => (
            <Pencil key={i} x={8 + i * 5.5} y={17 + (i % 2) * 2} s={1.15} rot={-25 + i * 14} body={c} />
          ))}
        </g>
      ))}
      <Star x={52.5} y={13} r={4} fill="#f2b632" />
      <Star x={43} y={20} r={2} fill="#e0663a" />
      <Star x={62} y={20} r={2} fill="#3f9acb" />
      {[[9, 60], [96, 64], [8, 88], [97, 92], [10, 112], [94, 116]].map(([x, y], i) => (
        <Star key={i} x={x} y={y} r={i % 2 ? 1.8 : 2.4} fill={PENCIL_COLORS[i % 5]} />
      ))}
      <Sparkle x={22} y={64} r={2} fill="#f2b632" />
      <Sparkle x={84} y={66} r={2} fill="#e0663a" />
      <Apple x={52.5} y={138} s={1.0} />
      <Book x={22} y={136} s={1.1} cover="#3f9acb" rot={-8} />
      <Book x={84} y={136} s={1.1} cover="#6fb06a" rot={8} />
      <Confetti colors={PENCIL_COLORS} items={[[34, 140, "r", 20], [72, 141, "t", 30], [40, 132, "c", 0], [66, 131, "c", 0]]} />
    </>
  );
}

export function SchoolChalkboard() {
  const chalk = "#f4f1e6";
  return (
    <>
      <Bg fill="#2f4a3f" />
      {/* Wooden frame */}
      <rect x="1.5" y="1.5" width="102" height="145" fill="none" stroke="#a9794a" strokeWidth="3" />
      <rect x="3.4" y="3.4" width="98.2" height="141.2" fill="none" stroke="#7f5731" strokeWidth="0.5" />
      {/* Chalk doodles, kept to the sides so the text stays clear */}
      <g fill="none" stroke={chalk} strokeWidth="0.55" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
        <path d="M8 20 l6 -6 l6 6 M10 20 v6 h8 v-6" />
        <path d="M85 14 h10 M85 19 h10 M85 24 h7" />
        <path d="M8 62 q4 -6 6 0 t6 0" />
        <circle cx="90" cy="62" r="4" />
        <path d="M8 84 l4 -8 l4 8 z" />
        <path d="M86 78 l7 7 M93 78 l-7 7" />
        <path d="M8 98 h9 M8 103 h9 M8 108 h5" />
        <circle cx="91" cy="100" r="3.4" />
        <path d="M89 100 h4 M91 98 v4" />
        <path d="M8 120 q5 -8 10 0" />
        <path d="M86 120 q5 -8 10 0" />
      </g>
      <Star x={52.5} y={13} r={4} fill="#f6d86a" />
      <Star x={42} y={19} r={2} fill={chalk} />
      <Star x={63} y={19} r={2} fill={chalk} />
      <Sparkle x={24} y={32} r={2} fill="#f6d86a" />
      <Sparkle x={81} y={34} r={2} fill="#f6d86a" />
      {/* Chalk and an eraser on the ledge */}
      <rect x="2" y="134" width="101" height="9" fill="#a9794a" />
      <rect x="2" y="134" width="101" height="2" fill="#c89a68" />
      <rect x="20" y="130.2" width="9" height="3.8" rx="1" fill="#e9e4d4" />
      <rect x="32" y="131.2" width="5" height="2.8" rx="0.8" fill="#f6d86a" />
      <Apple x={84} y={129} s={0.9} />
      <Pencil x={64} y={131} s={0.9} rot={90} body="#f2b632" />
    </>
  );
}

export function SchoolBooks() {
  const covers = ["#3f7fc4", "#e8923a", "#6fb06a", "#c05fb0"];
  return (
    <>
      <Bg fill="#eef5ff" />
      <Frame stroke="#b6d0f2" width={0.5} inset={3.5} />
      {/* Stacks of books in the bottom corners */}
      {[0, 1].map((side) => (
        <g key={side} transform={side ? "translate(105 0) scale(-1 1)" : undefined}>
          {covers.slice(0, 3).map((c, i) => (
            <Book key={i} x={15 + (i % 2) * 1.2} y={138 - i * 9.5} s={1.0} cover={c} rot={i % 2 ? 3 : -3} />
          ))}
        </g>
      ))}
      <Pencil x={52.5} y={134} s={1.2} rot={90} body="#e8923a" />
      <Star x={52.5} y={13} r={4} fill="#e8923a" />
      <Star x={42} y={19} r={2} fill="#3f7fc4" />
      <Star x={63} y={19} r={2} fill="#6fb06a" />
      {[[9, 64], [96, 68], [8, 86], [97, 90]].map(([x, y], i) => (
        <Star key={i} x={x} y={y} r={i % 2 ? 1.8 : 2.4} fill={covers[i % 4]} />
      ))}
      <Sparkle x={22} y={30} r={2} fill="#e8923a" />
      <Sparkle x={83} y={30} r={2} fill="#3f7fc4" />
      <Apple x={14} y={14} s={1.1} />
      <Apple x={91} y={14} s={1.1} fill="#7fb069" />
    </>
  );
}
