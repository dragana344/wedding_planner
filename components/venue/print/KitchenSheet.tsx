import "@/components/seating/print/print.css";
import "./kitchen.css";
import { PrintButton } from "@/components/seating/print/PrintButton";
import { formatChangedAt } from "@/lib/changes/format";
import { estimateNote, NO_MEAL_LABEL } from "@/lib/menu-numbers";
import type { KitchenSheetData } from "@/lib/venue/kitchen-sheet";

const withEstimate = (n: number, estimated: number) => (estimated > 0 ? `${n} (${estimateNote(estimated)})` : String(n));

/** The printable kitchen sheet for one event (decision 10). */
export function KitchenSheet({ data, backHref }: { data: KitchenSheetData; backHref?: string }) {
  const { latest } = data;
  const sub = [data.date, data.start, data.halls.join(", ")].filter(Boolean).join(" · ");
  return (
    <div className="s3-print-root">
      <div className="s3-print-toolbar">
        {backHref ? <a href={backHref}>← Назад</a> : null}
        <PrintButton />
        <span>A4, портретно.</span>
      </div>
      <section className="s3-print-page is-kitchen" aria-label="Лист за кујна">
        <header>
          <h1 className="kitchen-title">Лист за кујна — {data.title}</h1>
          <p className="kitchen-sub">{sub}</p>
        </header>

        {!latest ? (
          <p className="kitchen-headcount">Парот сè уште не ги испратил бројките за мени.</p>
        ) : (
          <>
            <p className="kitchen-headcount">
              Вкупно лица: <b>{data.headcount}</b>
              {data.estimated > 0 ? <span className="kitchen-estimate">{` (${estimateNote(data.estimated)})`}</span> : null}
            </p>

            {data.changes.length > 0 ? (
              <div className="kitchen-section kitchen-changes" role="status">
                <b>Промени по испратените бројки — проверете со парот</b>
                <ul>
                  {data.changes.map((c) => (
                    <li key={c.id}>{c.text}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="kitchen-section">
              <h2>Менија</h2>
              <table className="kitchen-table">
                <thead>
                  <tr>
                    <th>Мени</th>
                    <th className="num">Порции</th>
                  </tr>
                </thead>
                <tbody>
                  {data.menus.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td className="num">
                        {m.count}
                        {m.estimated > 0 ? <span className="kitchen-estimate">{` (${estimateNote(m.estimated)})`}</span> : null}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <b>Вкупно оброци</b>
                    </td>
                    <td className="num">
                      <b>{withEstimate(data.meals, data.estimated)}</b>
                    </td>
                  </tr>
                  <tr>
                    <td>{NO_MEAL_LABEL}</td>
                    <td className="num">{data.noMeal}</td>
                  </tr>
                </tbody>
              </table>
              {latest.unanswered ? (
                <p className="kitchen-estimate">{`${latest.unanswered} гости немаа одговор при испраќањето${data.estimated > 0 ? " — нивниот дел е проценка" : ""}.`}</p>
              ) : null}
            </div>

            <div className="kitchen-section">
              <h2>Алергии</h2>
              {data.allergySummary ? (
                <p>{data.allergySummary}</p>
              ) : data.allergyTables.length === 0 && data.allergyUnseated.length === 0 ? (
                <p>Нема пријавени алергии.</p>
              ) : (
                <table className="kitchen-table">
                  <thead>
                    <tr>
                      <th>Маса</th>
                      <th>Гостин</th>
                      <th>Мени</th>
                      <th>Алергија</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.allergyTables.flatMap((t) =>
                      t.notes.map((n, i) => (
                        <tr key={`${t.table}-${i}`}>
                          <td>{i === 0 ? t.table : ""}</td>
                          <td>{n.guestName}</td>
                          <td>{n.menuName}</td>
                          <td>{n.text}</td>
                        </tr>
                      )),
                    )}
                    {data.allergyUnseated.map((n, i) => (
                      <tr key={`u-${i}`}>
                        <td>{i === 0 ? "Без место" : ""}</td>
                        <td>{n.guestName}</td>
                        <td>{n.menuName}</td>
                        <td>{n.text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        <p className="kitchen-foot">
          {latest ? `Бројки испратени на ${formatChangedAt(latest.sentAt)} (${latest.sentBy}). ` : ""}
          Генерирано на {data.generatedAt}.
        </p>
      </section>
    </div>
  );
}

