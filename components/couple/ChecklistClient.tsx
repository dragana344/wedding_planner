"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import type { ChecklistItem, ChecklistStats, ChecklistSubtask } from "@/lib/couple/checklist";
import { checklistItemVendorCategory } from "@/lib/couple/checklist-vendor-link";
import { formatMkDate, todayIn } from "@/lib/date";
import { Icon } from "@/components/venue/shell/Icon";
import { SprigIcon } from "@/components/seating/couple-icons";
import "@/components/seating/couple-seating.css";
import "./ChecklistClient.css";

function SubtaskList({ item, onChanged, autoFocus }: { item: ChecklistItem; onChanged: () => void; autoFocus: boolean }) {
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await jsonOrThrow(
        await fetch(`/api/couple/checklist/${item.id}/subtasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        })
      );
      setNewTitle("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на подзадачата.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggle(subtask: ChecklistSubtask) {
    setError(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/couple/checklist/${item.id}/subtasks/${subtask.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_done: !subtask.is_done }),
        })
      );
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на подзадачата.");
    }
  }

  async function handleDelete(subtaskId: string) {
    setError(null);
    try {
      await jsonOrThrow(await fetch(`/api/couple/checklist/${item.id}/subtasks/${subtaskId}`, { method: "DELETE" }));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на подзадачата.");
    }
  }

  return (
    <div className="ck-subtasks">
      {item.subtasks.length > 0 ? (
        <ul className="ck-subtask-list">
          {item.subtasks.map((subtask) => (
            <li key={subtask.id} className={`ck-subtask${subtask.is_done ? " is-done" : ""}`}>
              <input type="checkbox" className="ck-check ck-check-sm" checked={subtask.is_done} onChange={() => handleToggle(subtask)} aria-label={subtask.title} />
              <span className="ck-subtask-title">{subtask.title}</span>
              <button type="button" onClick={() => handleDelete(subtask.id)} aria-label={`Избриши ${subtask.title}`} className="ck-icon-btn">
                <Icon name="x" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={handleAdd} className="ck-subtask-add">
        <input
          ref={inputRef}
          className="fld"
          placeholder="Додај опција или подзадача..."
          aria-label="Додај опција или подзадача..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button type="submit" disabled={isSubmitting} className="ck-pill-btn">
          Додај
        </button>
      </form>
      {error ? <p className="ck-error">{error}</p> : null}
    </div>
  );
}

/**
 * The couple's Чеклиста, styled like their Распоред page (couple-seating.css:
 * header, buttons, segmented switch, cards); ChecklistClient.css only adds
 * the checklist's own pieces.
 */
export function ChecklistClient({
  coupleNames,
  initialItems,
  initialStats,
}: {
  coupleNames: string;
  initialItems: ChecklistItem[];
  initialStats: ChecklistStats;
}) {
  const [items, setItems] = useState(initialItems);
  const [stats, setStats] = useState(initialStats);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(true);
  // Rows whose subtasks are showing; `focusSubtaskId` is the one whose
  // "Додај подзадача" was just clicked, so its input takes focus.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusSubtaskId, setFocusSubtaskId] = useState<string | null>(null);

  function toggleExpanded(id: string) {
    setFocusSubtaskId(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openSubtaskForm(id: string) {
    setExpanded((prev) => new Set(prev).add(id));
    setFocusSubtaskId(id);
  }

  async function refresh() {
    const data = await jsonOrThrow(await fetch("/api/couple/checklist"));
    setItems(data.items);
    setStats(data.stats);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await jsonOrThrow(
        await fetch("/api/couple/checklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, due_date: dueDate || null }),
        })
      );
      setTitle("");
      setDueDate("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа додавањето на задачата.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggle(item: ChecklistItem) {
    setError(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/couple/checklist/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "toggle", is_done: !item.is_done }),
        })
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на задачата.");
    }
  }

  function startEdit(item: ChecklistItem) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDueDate(item.due_date ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(itemId: string) {
    setError(null);
    try {
      await jsonOrThrow(
        await fetch(`/api/couple/checklist/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: editTitle, due_date: editDueDate || null }),
        })
      );
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа ажурирањето на задачата.");
    }
  }

  async function handleDelete(itemId: string) {
    setError(null);
    try {
      await jsonOrThrow(await fetch(`/api/couple/checklist/${itemId}`, { method: "DELETE" }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на задачата.");
    }
  }

  const donePct = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;
  const today = todayIn();
  const needle = query.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (filter === "all" || (filter === "done") === item.is_done) &&
      (!needle || item.title.toLowerCase().includes(needle) || item.subtasks.some((st) => st.title.toLowerCase().includes(needle)))
  );
  const filters = [
    { key: "all", label: `Сите (${stats.total})`, icon: "menu" },
    { key: "open", label: `Отворени (${stats.open})`, icon: null },
    { key: "done", label: `Завршени (${stats.done})`, icon: "tick" },
  ] as const;

  return (
    <div className="cs-page ck">
      <header className="cs-head">
        <SprigIcon className="cs-head-sprig" />
        <div className="cs-head-text">
          <p className="cs-eyebrow">{coupleNames}</p>
          <h2 className="cs-title">Чеклиста</h2>
          <p className="ck-sub">Задачи за планирање на свадбата</p>
        </div>
      </header>

      <section className="cs-card ck-progress" aria-label="Напредок на чеклистата">
        <SprigIcon className="ck-progress-sprig" />
        <p className="ck-eyebrow">Напредок на чеклистата</p>
        <div className="ck-progress-row">
          <p className="ck-score">
            <span className="ck-score-done">{stats.done}</span>
            <span className="ck-score-total"> / {stats.total}</span>
            <span className="ck-score-lab">завршени</span>
          </p>
          <p className="ck-open">
            <span className="ck-open-num">{stats.open}</span>
            <span className="ck-score-lab">отворени</span>
          </p>
        </div>
        <div role="img" aria-label={`Чеклиста: завршено ${donePct}%, отворено ${100 - donePct}%`} className="ck-bar">
          <span style={{ width: `${donePct}%` }} />
        </div>
      </section>

      <div className="ck-filters">
        <div role="group" aria-label="Прикажи задачи" className="cs-views">
          {filters.map((f) => (
            <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.icon ? <Icon name={f.icon} size="sm" /> : <span className="ck-ring" aria-hidden />}
              {f.label}
            </button>
          ))}
        </div>
        <label className="cs-search ck-search">
          <Icon name="search" size="sm" className="cs-search-ic" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пребарај задача..." aria-label="Пребарај задача" />
        </label>
      </div>

      <div className="ck-grid">
        <section className="cs-card ck-tasks" aria-labelledby="ck-tasks-h">
          <div className="ck-card-head">
            <h2 id="ck-tasks-h" className="ck-card-title">
              Задачи
            </h2>
            <span className="ck-muted">{stats.open} отворени</span>
          </div>
          {items.length === 0 ? (
            <p className="ck-empty">Сè уште нема додадени задачи.</p>
          ) : visible.length === 0 ? (
            <p className="ck-empty">Нема задачи за овој приказ.</p>
          ) : null}
          <ul className="ck-list">
            {visible.map((item) => {
              const isOverdue = !item.is_done && item.due_date !== null && item.due_date < today;
              const isOpen = expanded.has(item.id);
              const subDone = item.subtasks.filter((st) => st.is_done).length;
              const vendorCategory = checklistItemVendorCategory(item.title);
              if (editingId === item.id) {
                return (
                  <li key={item.id} className="ck-row ck-row-edit">
                    <input className="fld" aria-label="Наслов на задачата" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                    <input className="fld" aria-label="Рок" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                    <div className="ck-edit-actions">
                      <button type="button" onClick={() => handleSaveEdit(item.id)} className="cs-btn cs-btn-primary">
                        Зачувај
                      </button>
                      <button type="button" onClick={cancelEdit} className="cs-btn">
                        Откажи
                      </button>
                    </div>
                  </li>
                );
              }
              return (
                <li key={item.id} className={`ck-row${item.is_done ? " is-done" : ""}`}>
                  <input type="checkbox" className="ck-check" checked={item.is_done} onChange={() => handleToggle(item)} aria-label={item.title} />
                  <div className="ck-row-main">
                    <p className="ck-title">{item.title}</p>
                    <div className="ck-row-sub">
                      <button type="button" className="ck-pill-btn" onClick={() => openSubtaskForm(item.id)} aria-label={`Додај подзадача за ${item.title}`}>
                        <Icon name="plus" size="sm" />
                        Додај подзадача
                      </button>
                      {item.subtasks.length > 0 ? (
                        <span className="ck-muted">
                          {subDone}/{item.subtasks.length} подзадачи
                        </span>
                      ) : null}
                      {vendorCategory ? (
                        <Link href={`/couple/partners?category=${vendorCategory}`} className="ck-pill-btn">
                          Погледни добавувачи
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <span className={`ck-due${isOverdue ? " is-overdue" : ""}`}>
                    <Icon name="cal" size="sm" />
                    {item.due_date ? formatMkDate(item.due_date) : "Без рок"}
                    {isOverdue ? <b>Задоцнето</b> : null}
                  </span>
                  <div className="ck-actions">
                    <button type="button" onClick={() => startEdit(item)} aria-label={`Измени ${item.title}`} className="ck-action">
                      <Icon name="edit" size="sm" />
                      Измени
                    </button>
                    <span className="ck-action-div" aria-hidden />
                    <button type="button" onClick={() => handleDelete(item.id)} aria-label={`Избриши ${item.title}`} className="ck-action ck-action-danger">
                      <Icon name="trash" size="sm" />
                      Избриши
                    </button>
                  </div>
                  <button
                    type="button"
                    className="ck-icon-btn ck-expand"
                    aria-expanded={isOpen}
                    aria-label={`Подзадачи за ${item.title}`}
                    onClick={() => toggleExpanded(item.id)}
                  >
                    <Icon name="down" size="sm" />
                  </button>
                  {isOpen ? <SubtaskList item={item} onChanged={refresh} autoFocus={focusSubtaskId === item.id} /> : null}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="cs-card ck-add" aria-labelledby="ck-add-h">
          <h2 id="ck-add-h" className="ck-card-head">
            <button type="button" className="ck-add-toggle" aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)}>
              <Icon name="plus" size="sm" />
              <span className="ck-card-title">Додај задача</span>
              <Icon name="down" size="sm" className="ck-caret" />
            </button>
          </h2>
          {addOpen ? (
            <form onSubmit={handleAdd} className="ck-add-form">
              <div>
                <label className="lab-s" htmlFor="checklist-title">
                  Наслов на задачата
                </label>
                <input id="checklist-title" className="fld" placeholder="пр. Нарачај торта" value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div>
                <label className="lab-s" htmlFor="checklist-due-date">
                  Рок (опционално)
                </label>
                <input id="checklist-due-date" className="fld" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              {error ? <p className="ck-error">{error}</p> : null}
              <button type="submit" disabled={isSubmitting} className="cs-btn cs-btn-primary ck-submit">
                {isSubmitting ? "Се додава..." : "Додај задача"}
              </button>
            </form>
          ) : error ? (
            <p className="ck-error" style={{ padding: "0 20px 16px" }}>{error}</p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
