import "./print.css";
import { PrintButton } from "./PrintButton";

export interface QrCard {
  id: string;
  title: string;
  room: string;
  /** Inline SVG from lib/seating/qr.ts (generated on the server from our own URL). */
  svg: string;
}

const PER_PAGE = 6;

/** QR cards for the tables (B7): six per A4 portrait page, then how to place them. */
export function TableQrCards({
  title,
  hint,
  cards,
  fontClassName,
  backHref,
}: {
  title: string;
  hint: string;
  cards: QrCard[];
  fontClassName?: string;
  backHref?: string;
}) {
  const pages: QrCard[][] = [];
  for (let i = 0; i < cards.length; i += PER_PAGE) pages.push(cards.slice(i, i + PER_PAGE));

  return (
    <div className={`s3-print-root ${fontClassName ?? ""}`}>
      <div className="s3-print-toolbar">
        {backHref ? <a href={backHref}>← Назад</a> : null}
        <PrintButton />
        <span>A4, портрет. Сечете по рамката.</span>
      </div>
      {pages.map((page, n) => (
        <section key={n} className="s3-print-page is-cards" aria-label={`QR картички ${n + 1}`}>
          <div className="s3-qr-grid">
            {page.map((card) => (
              <figure key={card.id} className="s3-qr-card">
                <span className={`s3-qr-title${card.title.length > 14 ? " is-long" : ""}`}>{card.title}</span>
                {/* Our own server-generated SVG (qrcode lib), never user content. */}
                <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: card.svg }} />
                <figcaption className="s3-qr-hint">{hint}</figcaption>
                <span className="s3-qr-meta">
                  {title} · {card.room}
                </span>
              </figure>
            ))}
          </div>
        </section>
      ))}
      <section className="s3-print-page is-cards" aria-label="Како се поставуваат">
        <div className="s3-howto">
          <h2 className="s3-print-title">Како се поставуваат картичките</h2>
          <ol>
            <li>Испечатете ги страниците на дебела хартија (200–300 g/m²), со вклучени позадински бои.</li>
            <li>Исечете ја секоја картичка по надворешната златна рамка.</li>
            <li>Ставете ја картичката во држач или превиткајте ја на половина и поставете ја на средината од масата со исто име.</li>
            <li>Проверете со телефон дека секој код се отвора пред гостите да пристигнат.</li>
          </ol>
          <svg viewBox="0 0 300 160" width="100%" role="img" aria-label="Картичка во држач на масата">
            <ellipse cx="150" cy="130" rx="130" ry="22" fill="#fffdf8" stroke="#B8913A" strokeWidth="2" />
            <rect x="115" y="30" width="70" height="90" fill="#fffdf8" stroke="#B8913A" strokeWidth="2" />
            <rect x="130" y="55" width="40" height="40" fill="none" stroke="#5B4A3A" strokeWidth="2" />
            <rect x="140" y="118" width="20" height="10" fill="#B8913A" />
          </svg>
        </div>
      </section>
    </div>
  );
}
