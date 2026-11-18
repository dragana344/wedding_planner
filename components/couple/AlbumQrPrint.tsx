"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Comfortaa, Cormorant_Garamond, Great_Vibes, Montserrat, Pacifico } from "next/font/google";
import { MAX_PRINT_COUNT, type PrintOptions } from "@/lib/media/print-options";
import { designsFor, printDesign, type PrintDesignId, type PrintFont } from "@/lib/media/print-designs";
import { PrintDesignArt } from "./PrintDesignArt";

// Heading fonts. "Forever" and "Love" are Latin script; the Macedonian
// headings need fonts with Cyrillic.
const script = Great_Vibes({ subsets: ["latin"], weight: "400" });
const playful = Pacifico({ subsets: ["latin", "cyrillic"], weight: "400" });
const serif = Cormorant_Garamond({ subsets: ["latin", "cyrillic"], weight: "500", style: "italic" });
const sans = Montserrat({ subsets: ["latin", "cyrillic"], weight: "600" });
const hand = Comfortaa({ subsets: ["latin", "cyrillic"], weight: "700" });
const FONTS: Record<PrintFont, { className: string }> = { script, serif, playful, sans, hand };

const CTA = "Скенирај и сподели ги твоите фотографии и видеа";

function Qr({ svg }: { svg: string | null }) {
  // The SVG is generated here by the qrcode library from our own URL.
  return svg ? <div className="s4-card-qr" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="s4-card-qr" aria-hidden />;
}

/** Printable QR cards (A6, four per A4 sheet) or an A4 poster for the album (C4). */
export function AlbumQrPrint({
  guestPath,
  options,
  eventType = "",
  design = "classic",
}: {
  guestPath: string;
  options: PrintOptions;
  /** Which designs the picker offers. */
  eventType?: string;
  design?: PrintDesignId;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const chosen = printDesign(design);
  const heading = chosen.heading;
  const designed = chosen.id !== "classic";
  const cardClass = `s4-card${designed ? " s4-designed" : ""}`;
  const posterClass = `s4-poster${designed ? " s4-designed" : ""}`;
  // The design's colours and spacing reach the CSS as variables.
  const t = chosen.theme;
  const themeStyle = designed
    ? ({
        "--pd-bg": t.bg,
        "--pd-text": t.text,
        "--pd-accent": t.accent,
        "--pd-line": t.line,
        "--pd-hsize": `${t.headingSize}cqw`,
        "--pd-top": `${t.padTop}cqh`,
        "--pd-bottom": `${t.padBottom}cqh`,
      } as React.CSSProperties)
    : undefined;
  const title = heading ? <p className={`s4-card-heading ${FONTS[heading.font].className}`}>{heading.text}</p> : null;
  // A designed card keeps its text in one block over the artwork; the classic card is as it was.
  const body = (children: React.ReactNode) => (designed ? <div className="s4-body">{children}</div> : children);

  // After mount: the link's origin is the browser's, like the invitation link.
  useEffect(() => {
    QRCode.toString(`${window.location.origin}${guestPath}`, { type: "svg", margin: 1 })
      .then(setSvg)
      .catch(() => setSvg(null));
  }, [guestPath]);

  return (
    <div className="s4-print">
      <form className="s4-print-controls" method="get">
        <label>
          <span>Формат</span>
          <select className="fld" name="format" defaultValue={options.format}>
            <option value="a6">Картички А6 (4 на лист А4)</option>
            <option value="a4">Постер А4</option>
          </select>
        </label>
        <label>
          <span>Дизајн</span>
          <select className="fld" name="design" defaultValue={design}>
            {designsFor(eventType).map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Број на картички</span>
          <input className="fld" type="number" name="count" min={1} max={MAX_PRINT_COUNT} defaultValue={options.count} />
        </label>
        <label className="s4-print-check">
          <input type="checkbox" name="numbered" value="1" defaultChecked={options.numbered} />
          <span>Број на маса на секоја картичка</span>
        </label>
        <button className="btn btn-ghost" type="submit">
          Прикажи
        </button>
        <button className="btn btn-gold" type="button" onClick={() => window.print()}>
          Печати
        </button>
      </form>

      {options.format === "a4" ? (
        <section className={posterClass} style={themeStyle}>
          <PrintDesignArt design={design} />
          {body(
            <>
              {title ?? <p className="s4-card-kicker">Албум</p>}
              <Qr svg={svg} />
              <p className="s4-card-cta">{CTA}</p>
            </>,
          )}
        </section>
      ) : (
        <div className="s4-sheet">
          {Array.from({ length: options.count }, (_, i) => (
            <section key={i} className={cardClass} style={themeStyle}>
              <PrintDesignArt design={design} />
              {body(
                <>
                  {title}
                  {options.numbered && <p className="s4-card-table">Маса {i + 1}</p>}
                  <Qr svg={svg} />
                  <p className="s4-card-cta">{CTA}</p>
                </>,
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
