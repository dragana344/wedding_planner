import "./print.css";
import type { PrintGuestGroup } from "@/lib/couple/guest-print";
import { PrintButton } from "@/components/seating/print/PrintButton";

/** The couple's printable guest list: name, phone, party size, status, menu and allergies, grouped by side for a wedding. */
export function PrintGuestList({
  title,
  subtitle,
  groups,
  fontClassName,
  backHref,
}: {
  title: string;
  subtitle: string;
  groups: PrintGuestGroup[];
  fontClassName?: string;
  backHref?: string;
}) {
  return (
    <div className={`gl-print-root ${fontClassName ?? ""}`}>
      <div className="gl-print-toolbar">
        {backHref ? <a href={backHref}>← Назад</a> : null}
        <PrintButton />
      </div>
      <section className="gl-print-page" aria-label="Листа на гости">
        <header className="gl-print-head">
          <h1 className="gl-print-title">{title}</h1>
          <span className="gl-print-sub">{subtitle}</span>
        </header>
        {groups.map((group) => (
          <div key={group.label ?? "all"} className="gl-print-group">
            {group.label ? (
              <h2 className="gl-print-group-title">
                <span>{group.label}</span>
                <span>
                  {group.totalPeople} {group.totalPeople === 1 ? "лице" : "лица"}
                </span>
              </h2>
            ) : null}
            {group.rows.length === 0 ? (
              <p style={{ fontSize: 13 }}>Нема гости.</p>
            ) : (
              <table className="gl-print-table">
                <thead>
                  <tr>
                    <th>Име и презиме</th>
                    <th>Телефон</th>
                    <th>Лица</th>
                    <th>Статус</th>
                    <th>Мени</th>
                    <th>Алергии</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.fullName}</td>
                      <td>{row.phone ?? "—"}</td>
                      <td>
                        {row.partySize}
                        {row.childrenCount > 0 ? ` (${row.childrenCount} деца)` : ""}
                      </td>
                      <td>{row.status}</td>
                      <td>{row.menu || "—"}</td>
                      <td>{row.allergies ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
