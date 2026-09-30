"use client";

import type { MessageRow } from "@/lib/admin/queries";
import { todayIn } from "@/lib/date";
import { ActionButton } from "@/components/admin/ActionButton";
import { setMessageStatus, deleteMessage } from "@/app/admin/(panel)/messages/actions";

const STATUS_LABELS: Record<string, string> = { new: "Нова", read: "Прочитано", answered: "Одговорено" };

// Contact submissions are the platform's own data, not a venue's or a
// couple's (spec §5 item 5), so this table may show name/email/message —
// see the allow-list comment in tests/security/admin-static.test.ts.
export function MessagesTable({ messages }: { messages: MessageRow[] }) {
  return (
    <table className="s1-tbl">
      <thead>
        <tr>
          <th>Датум</th>
          <th>Име</th>
          <th>Е-пошта</th>
          <th>Порака</th>
          <th>Статус</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {messages.map((m) => (
          <tr key={m.id}>
            {/* Europe/Skopje calendar date, not the raw UTC date (REL-006) —
                the same lib/date.ts helper the rest of the admin dashboard
                uses for "today", reused here for an arbitrary timestamp. */}
            <td>{todayIn(undefined, new Date(m.createdAt))}</td>
            <td>{m.name}</td>
            <td>
              {m.email} — <a href={`mailto:${encodeURIComponent(m.email)}`}>пиши</a>
            </td>
            <td style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>{m.message}</td>
            <td>{STATUS_LABELS[m.status] ?? m.status}</td>
            <td>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {m.status !== "read" ? <ActionButton label="Прочитано" action={() => setMessageStatus({ id: m.id, status: "read" })} /> : null}
                {m.status !== "answered" ? (
                  <ActionButton label="Одговорено" action={() => setMessageStatus({ id: m.id, status: "answered" })} />
                ) : null}
                <ActionButton label="Избриши" confirm="Да се избрише пораката?" action={() => deleteMessage({ id: m.id })} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
