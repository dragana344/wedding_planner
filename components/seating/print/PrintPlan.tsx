import "./print.css";
import type { PrintItem, PrintRoom } from "@/lib/seating/print";
import { PrintButton } from "./PrintButton";

const GOLD = "#B8913A";
const INK = "#5B4A3A";
/** Project C: the printed plan's real selling point — which table needs a different dish. */
const MENU_NOTE_COLOR = "#B13A3A";

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

  const menuNote = item.menuNote ? (
    <text x={cx} y={item.y + item.h + stroke * 7} textAnchor="middle" fontSize={Math.min(item.w, item.h) * 0.16} fill={MENU_NOTE_COLOR}>
      {item.menuNote}
    </text>
  ) : null;

  if (item.shape === "circle") {
    return (
      <g transform={transform}>
        <ellipse cx={cx} cy={cy} rx={item.w / 2} ry={item.h / 2} fill="#FFFDF8" stroke={GOLD} strokeWidth={stroke} />
        {text}
        {menuNote}
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
      {menuNote}
    </g>
  );
}

/**
 * The part of the hall that has something in it (rotations included), plus a
 * margin for the frame. Printing just that keeps the plan centred on the
 * page and keeps tables and zones that stand against a wall off the frame.
 */
function contentBox(room: PrintRoom): { x: number; y: number; w: number; h: number } {
  if (room.items.length === 0) return { x: 0, y: 0, w: room.widthCm, h: room.heightCm };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of room.items) {
    const cx = item.x + item.w / 2;
    const cy = item.y + item.h / 2;
    const rad = (item.rotation * Math.PI) / 180;
    const halfW = (Math.abs(Math.cos(rad)) * item.w + Math.abs(Math.sin(rad)) * item.h) / 2;
    // Room below for a table's menu note.
    const halfH = (Math.abs(Math.sin(rad)) * item.w + Math.abs(Math.cos(rad)) * item.h) / 2 + (item.menuNote ? item.h * 0.3 : 0);
    minX = Math.min(minX, cx - halfW);
    maxX = Math.max(maxX, cx + halfW);
    minY = Math.min(minY, cy - halfH);
    maxY = Math.max(maxY, cy + halfH);
  }
  const margin = Math.max(120, 0.1 * Math.max(maxX - minX, maxY - minY));
  return { x: minX - margin, y: minY - margin, w: maxX - minX + 2 * margin, h: maxY - minY + 2 * margin };
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
        const box = contentBox(room);
        // Line widths and text scale with the printed area, so a 40 m hall and a 15 m one look alike on paper.
        const scale = Math.max(box.w, box.h) / 3000;
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
              viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
              preserveAspectRatio="xMidYMid meet"
              fontFamily="inherit"
            >
              <rect x={box.x + pad / 2} y={box.y + pad / 2} width={box.w - pad} height={box.h - pad} fill="none" stroke={GOLD} strokeWidth={4 * scale} />
              <rect x={box.x + pad} y={box.y + pad} width={box.w - 2 * pad} height={box.h - 2 * pad} fill="none" stroke={GOLD} strokeWidth={1.5 * scale} />
              {room.items.map((item) => (
                <Item key={item.id} item={item} scale={scale} />
              ))}
            </svg>
            <footer className="s3-print-foot">
              <span className="s3-print-room">{room.name}</span>
              {/* eslint-disable-next-line @next/next/no-img-element -- venue logo from public storage */}
              {logoUrl ? <img className="s3-print-logo" src={logoUrl} alt="Лого на локалот" /> : null}
            </footer>
          </section>
        );
      })}
    </div>
  );
}
