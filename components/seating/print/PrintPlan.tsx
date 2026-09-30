import "./print.css";
import type { PrintItem, PrintRoom } from "@/lib/seating/print";
import { PrintButton } from "./PrintButton";

const GOLD = "#B8913A";
const INK = "#5B4A3A";

function Item({ item, scale }: { item: PrintItem; scale: number }) {
  const cx = item.x + item.w / 2;
  const cy = item.y + item.h / 2;
  const transform = item.rotation ? `rotate(${item.rotation} ${cx} ${cy})` : undefined;
  const stroke = 3 * scale;

  if (item.kind === "floor") {
    return (
      <g transform={transform}>
        <ellipse cx={cx} cy={cy} rx={item.w / 2} ry={item.h / 2} fill="none" stroke={GOLD} strokeWidth={stroke * 2.5} />
        <ellipse cx={cx} cy={cy} rx={item.w / 2 - stroke * 5} ry={item.h / 2 - stroke * 5} fill="none" stroke={GOLD} strokeWidth={stroke} />
      </g>
    );
  }

  if (item.kind === "pillar") {
    return <rect x={item.x} y={item.y} width={item.w} height={item.h} fill="#D8D0C2" transform={transform} />;
  }

  // Tables: a big italic number. Zones and named tables: fit the words to
  // the box — across the short side, along the long one.
  const across = item.vertical ? item.w : item.h;
  const along = item.vertical ? item.h : item.w;
  const fit = (size: number) => Math.min(size, (along * 0.85) / Math.max(1, item.text.length * 0.5));
  const fontSize =
    item.kind === "table"
      ? /^\S{1,3}$/.test(item.text)
        ? Math.min(item.w, item.h) * 0.42 // a table number
        : fit(Math.min(item.w, item.h) * 0.3) // a name like "Кумови"
      : fit(Math.min(across * 0.42, 90 * scale));
  const text = (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={fontSize}
      fill={INK}
      className={item.kind === "table" ? "s3-print-num" : undefined}
      writingMode={item.vertical ? "vertical-rl" : undefined}
    >
      {item.text}
    </text>
  );

  if (item.shape === "circle") {
    return (
      <g transform={transform}>
        <ellipse cx={cx} cy={cy} rx={item.w / 2} ry={item.h / 2} fill="#FFFDF8" stroke={GOLD} strokeWidth={stroke} />
        {text}
      </g>
    );
  }
  return (
    <g transform={transform}>
      <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={item.kind === "named-table" ? item.h / 3 : 4 * scale} fill="#FFFDF8" stroke={item.kind === "zone" ? "#C7B79C" : GOLD} strokeWidth={stroke} />
      {item.kind === "named-table" ? (
        <rect
          x={item.x + stroke * 3}
          y={item.y + stroke * 3}
          width={Math.max(0, item.w - stroke * 6)}
          height={Math.max(0, item.h - stroke * 6)}
          rx={item.h / 4}
          fill="none"
          stroke={GOLD}
          strokeWidth={stroke / 2}
        />
      ) : null}
      {text}
    </g>
  );
}

/**
 * The printable seating plan (B7): one A4 landscape page per hall, cream and
 * gold like the client's printed sample, the couple's names on top and the
 * venue's logo bottom right.
 */
export function PrintPlan({
  title,
  subtitle,
  logoUrl,
  rooms,
  fontClassName,
  backHref,
}: {
  title: string;
  subtitle: string;
  logoUrl: string | null;
  rooms: PrintRoom[];
  fontClassName?: string;
  backHref?: string;
}) {
  return (
    <div className={`s3-print-root ${fontClassName ?? ""}`}>
      <div className="s3-print-toolbar">
        {backHref ? <a href={backHref}>← Назад</a> : null}
        <PrintButton />
        <span>A4, пејзажно. Во прозорецот за печатење вклучете „Background graphics“.</span>
      </div>
      {rooms.map((room) => {
        // Line widths and text scale with the hall, so a 40 m hall and a 15 m one look alike on paper.
        const scale = Math.max(room.widthCm, room.heightCm) / 3000;
        const pad = 40 * scale;
        return (
          <section key={room.id} className="s3-print-page is-plan" aria-label={`План на сала ${room.name}`}>
            <header className="s3-print-head">
              <h1 className="s3-print-title">{title}</h1>
              <span className="s3-print-sub">{subtitle}</span>
            </header>
            <svg
              data-testid="print-plan-svg"
              className="s3-print-svg"
              viewBox={`0 0 ${room.widthCm} ${room.heightCm}`}
              preserveAspectRatio="xMidYMid meet"
              fontFamily="inherit"
            >
              <rect x={pad / 2} y={pad / 2} width={room.widthCm - pad} height={room.heightCm - pad} fill="none" stroke={GOLD} strokeWidth={4 * scale} />
              <rect x={pad} y={pad} width={room.widthCm - 2 * pad} height={room.heightCm - 2 * pad} fill="none" stroke={GOLD} strokeWidth={1.5 * scale} />
              {room.items.map((item) => (
                <Item key={item.id} item={item} scale={scale} />
              ))}
            </svg>
            <span className="s3-print-room">{room.name}</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- venue logo from public storage */}
            {logoUrl ? <img className="s3-print-logo" src={logoUrl} alt="Лого на локалот" /> : null}
          </section>
        );
      })}
    </div>
  );
}
