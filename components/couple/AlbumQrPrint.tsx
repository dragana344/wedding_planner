"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { MAX_PRINT_COUNT, type PrintOptions } from "@/lib/media/print-options";

const CTA = "Скенирај и сподели ги твоите фотографии";

function Qr({ svg }: { svg: string | null }) {
  // The SVG is generated here by the qrcode library from our own URL.
  return svg ? <div className="s4-card-qr" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="s4-card-qr" aria-hidden />;
}

/** Printable QR cards (A6, four per A4 sheet) or an A4 poster for the album (C4). */
export function AlbumQrPrint({ guestPath, options }: { guestPath: string; options: PrintOptions }) {
  const [svg, setSvg] = useState<string | null>(null);

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
        <section className="s4-poster">
          <p className="s4-card-kicker">Свадбен албум</p>
          <Qr svg={svg} />
          <p className="s4-card-cta">{CTA}</p>
        </section>
      ) : (
        <div className="s4-sheet">
          {Array.from({ length: options.count }, (_, i) => (
            <section key={i} className="s4-card">
              {options.numbered && <p className="s4-card-table">Маса {i + 1}</p>}
              <Qr svg={svg} />
              <p className="s4-card-cta">{CTA}</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
