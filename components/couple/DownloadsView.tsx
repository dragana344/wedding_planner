import { Icon } from "@/components/venue/shell/Icon";
import { formatVenueDatePadded } from "@/lib/date";
import { partHref } from "@/lib/media/download-pin";

// "Преземи ја вашата свадба" (group A task 7): the couple's whole event to keep
// on their computer — the wedding book, the spreadsheets and every photo and
// video. Plain links (GET), so it works in the read-only period and after a
// downgrade. No client state: rendered on the server.

export type DownloadsMedia = {
  /** When the page rendered: every part is planned from the files added before it (lib/media/download-pin.ts). */
  before: string;
  /** Size of each ZIP part in bytes, in order. */
  parts: number[];
  albumCount: number;
  greetingVideoCount: number;
  hasInvitationPhoto: boolean;
};

function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const cardBody = { padding: "8px 14px 14px", display: "flex", flexDirection: "column" as const, gap: 10 };
const text = { margin: 0, fontSize: 14, lineHeight: 1.55, color: "var(--muted)" };

export function DownloadsView({ isWedding, accessEnd, media }: { isWedding: boolean; /** Set during the read-only period: the day access ends. */ accessEnd: string | null; media: DownloadsMedia }) {
  const bookName = isWedding ? "Свадбена книга" : "Спомен-книга";
  const mediaSummary = [
    media.albumCount > 0 ? count(media.albumCount, "фотографија или видео од гостите", "фотографии и видеа од гостите") : null,
    media.greetingVideoCount > 0 ? count(media.greetingVideoCount, "видео честитка", "видео честитки") : null,
    media.hasInvitationPhoto ? "фотографијата од поканата" : null,
  ].filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      <p style={{ ...text, color: "var(--ink)", fontSize: 15 }}>
        {isWedding ? "Сè од вашата свадба" : "Сè од вашиот настан"}, засекогаш на вашиот компјутер: книга за листање и печатење, табели за Excel и сите
        фотографии и видеа.
        {accessEnd ? (
          <>
            {" "}
            <b>Пристапот трае до {formatVenueDatePadded(accessEnd)}</b> — потоа податоците се бришат, па преземете ги пред тоа.
          </>
        ) : null}
      </p>

      <section className="panel couple-card" aria-labelledby="dl-book">
        <div className="panel-h">
          <h2 className="panel-t" id="dl-book">
            <Icon name="book" size="sm" /> {bookName} (PDF)
          </h2>
        </div>
        <div style={cardBody}>
          <p style={text}>
            Вашата покана, програмата на денот, гостите и распоредот на маси, честитките, менито, буџетот, чеклистата и белешките — уредени како книга.
          </p>
          <div>
            <a className="btn btn-gold" href="/api/couple/download/book" download>
              Преземи ја книгата
            </a>
          </div>
        </div>
      </section>

      <section className="panel couple-card" aria-labelledby="dl-tables">
        <div className="panel-h">
          <h2 className="panel-t" id="dl-tables">
            <Icon name="chart" size="sm" /> Табели (ZIP со CSV)
          </h2>
        </div>
        <div style={cardBody}>
          <p style={text}>Списокот на гости, буџетот и распоредот на маси, за отворање во Excel.</p>
          <div>
            <a className="btn btn-ghost" href="/api/couple/download/tables" download>
              Преземи ги табелите
            </a>
          </div>
        </div>
      </section>

      <section className="panel couple-card" aria-labelledby="dl-media">
        <div className="panel-h">
          <h2 className="panel-t" id="dl-media">
            <Icon name="photo" size="sm" /> Фотографии и видеа
          </h2>
        </div>
        <div style={cardBody}>
          {media.parts.length === 0 ? (
            <p style={text}>Сè уште нема фотографии ни видеа.</p>
          ) : (
            <>
              <p style={text}>
                {mediaSummary.join(", ")}, во папки.
                {media.parts.length > 1 ? " Поради големината, преземањето е поделено на делови: преземете ги сите." : ""}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {media.parts.map((bytes, i) => (
                  <a key={i} className="btn btn-ghost" href={partHref("/api/couple/download/media", i + 1, media.before)} download>
                    {media.parts.length === 1 ? "Преземи ги сите" : `Дел ${i + 1} од ${media.parts.length}`} ({megabytes(bytes)})
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
