import Link from "next/link";
import type { InboxRow, InboxSource } from "@/lib/admin/queries";
import { todayIn } from "@/lib/date";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_PILL } from "@/lib/support/status";

export const INBOX_SOURCE_LABEL: Record<InboxSource, string> = { public: "Јавна форма", venue: "Локал", couple: "Пар" };

// Contact submissions are the platform's own data, not a venue's or a
// couple's (spec §5 item 5), so this table may show a sender's name and
// message — see the allow-list comment in tests/security/admin-static.test.ts.
export function InboxTable({ rows }: { rows: InboxRow[] }) {
  return (
    <table className="s1-tbl">
      <thead>
        <tr>
          <th>Последно</th>
          <th>Извор</th>
          <th>Од</th>
          <th>Тема</th>
          <th>Статус</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.kind}-${r.id}`}>
            {/* Europe/Skopje calendar date, not the raw UTC date (REL-006). */}
            <td>{todayIn(undefined, new Date(r.lastActivityAt))}</td>
            <td>{INBOX_SOURCE_LABEL[r.source]}</td>
            <td>
              {r.from}
              {r.venueName ? <div className="muted">{r.coupleNames ? `${r.coupleNames} · ${r.venueName}` : r.venueName}</div> : null}
            </td>
            <td style={{ maxWidth: 360 }}>
              {r.subject}
              {r.awaitingAdmin ? (
                <span className="pill p-bad" style={{ marginLeft: 8 }}>
                  Чека одговор
                </span>
              ) : null}
            </td>
            <td>
              <span className={`pill ${SUPPORT_STATUS_PILL[r.status]}`}>{SUPPORT_STATUS_LABEL[r.status]}</span>
            </td>
            <td>
              <Link className="btn btn-ghost" href={`/admin/messages/${r.kind}/${r.id}`}>
                Отвори
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
