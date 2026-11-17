"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AdminAccount, AdminTaskComment, AdminTaskRow } from "@/lib/admin/queries";
import { todayIn } from "@/lib/date";
import { SUPPORT_STATUS_LABEL, SUPPORT_STATUS_PILL } from "@/lib/support/status";
import { commentOnAdminTask, createAdminTask, deleteAdminTask, setAdminTaskStatus } from "@/app/admin/(panel)/support/actions";
import { Attachments, ThreadMessages, ThreadReplyForm } from "@/components/support/ThreadMessages";
import { StatusButtons } from "./StatusButtons";
import { AddPanel } from "@/components/shared/AddPanel";

const EVERYONE = "";

export const assigneeLabel = (task: AdminTaskRow): string => (task.assignedTo === null ? "Сите админи" : (task.assignedToEmail ?? "—"));

/** "New task" form: title, description, who gets it (one admin, or every
 * admin), and up to 5 photo/PDF attachments (0153). */
export function CreateAdminTaskForm({ admins }: { admins: AdminAccount[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState(EVERYONE);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createAdminTask({ title, description, assignedTo: assignedTo === EVERYONE ? null : assignedTo, files });
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setTitle("");
    setDescription("");
    setAssignedTo(EVERYONE);
    setFiles([]);
    router.push(`/admin/support?view=sent`);
  }

  return (
    <AddPanel title="Нова задача">
      <form onSubmit={submit} className="ev-form">
        <div className="ev-field">
          <label className="lab-s" htmlFor="task-title">
            Наслов <span className="req">*</span>
          </label>
          <input id="task-title" className="fld" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required disabled={busy} />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="task-assignee">
            Испрати до
          </label>
          <select id="task-assignee" className="fld" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} disabled={busy}>
            <option value={EVERYONE}>Сите админи (кој прв ќе ја земе)</option>
            {admins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
        </div>
        <div className="ev-field ev-field-wide">
          <label className="lab-s" htmlFor="task-description">
            Опис
          </label>
          <textarea
            id="task-description"
            className="fld"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={5000}
            disabled={busy}
          />
        </div>
        <div className="ev-field ev-field-wide">
          <label className="lab-s" htmlFor="task-files">
            Прилози (фотографии или PDF, најмногу 5)
          </label>
          <input
            id="task-files"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            disabled={busy}
          />
        </div>
        {error ? (
          <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-gold" disabled={busy || !title.trim()}>
          {busy ? "Се испраќа..." : "Испрати задача"}
        </button>
      </form>
    </AddPanel>
  );
}

export function AdminTasksTable({ tasks }: { tasks: AdminTaskRow[] }) {
  return (
    <table className="s1-tbl s1-cards">
      <thead>
        <tr>
          <th>Ажурирано</th>
          <th>Задача</th>
          <th>Од</th>
          <th>До</th>
          <th>Статус</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {tasks.map((t) => (
          <tr key={t.id}>
            <td data-label="Ажурирано">{todayIn(undefined, new Date(t.updatedAt))}</td>
            <td data-label="Задача" className="tc-main">{t.title}</td>
            <td data-label="Од">{t.createdByEmail ?? "—"}</td>
            <td data-label="До">{assigneeLabel(t)}</td>
            <td data-label="Статус">
              <span className={`pill ${SUPPORT_STATUS_PILL[t.status]}`}>{SUPPORT_STATUS_LABEL[t.status]}</span>
            </td>
            <td>
              <Link className="btn btn-ghost" href={`/admin/support/${t.id}`}>
                Отвори
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One task: the receiver's status buttons (the sender just watches the
 * status), the comment thread, and delete for the sender. */
export function AdminTaskDetail({
  task,
  comments,
  currentAdminId,
  canChangeStatus,
}: {
  task: AdminTaskRow;
  comments: AdminTaskComment[];
  currentAdminId: string;
  canChangeStatus: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const isSender = task.createdBy === currentAdminId;

  const entries = comments.map((c) => ({
    id: c.id,
    mine: c.authorId === currentAdminId,
    author: c.authorEmail ?? "—",
    body: c.body,
    createdAt: c.createdAt,
    attachments: c.attachments,
  }));

  return (
    <>
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">{task.title}</h2>
          <span className={`pill ${SUPPORT_STATUS_PILL[task.status]}`}>{SUPPORT_STATUS_LABEL[task.status]}</span>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            Од {task.createdByEmail ?? "—"} · до {assigneeLabel(task)} · испратено {todayIn(undefined, new Date(task.createdAt))}
            {task.completedAt ? ` · решено ${todayIn(undefined, new Date(task.completedAt))}` : ""}
          </p>
          {task.description ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{task.description}</p> : null}
          <Attachments items={task.attachments} />
          {canChangeStatus ? (
            <StatusButtons status={task.status} onChange={(status) => setAdminTaskStatus({ id: task.id, status })} />
          ) : isSender ? (
            <p className="muted" style={{ margin: 0 }}>
              Статусот го менува админот што ја доби задачата — овде гледате кога ќе ја започне и заврши.
            </p>
          ) : null}
          {isSender ? (
            <div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={async () => {
                  if (!window.confirm("Да се избрише задачата?")) return;
                  const r = await deleteAdminTask({ id: task.id });
                  if (r.ok) router.push("/admin/support?view=sent");
                  else setError(r.error);
                }}
              >
                Избриши задача
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Коментари</h2>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <ThreadMessages entries={entries} empty="Нема коментари." />
          {error ? (
            <p role="alert" style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>
              {error}
            </p>
          ) : null}
          <ThreadReplyForm
            id="task-comment"
            label="Коментар"
            placeholder="Напишете коментар..."
            submitLabel="Додај коментар"
            allowFiles
            onSend={async (body, files) => {
              const r = await commentOnAdminTask({ id: task.id, body, files });
              setError(r.ok ? null : r.error);
              return r.ok;
            }}
          />
        </div>
      </section>
    </>
  );
}
