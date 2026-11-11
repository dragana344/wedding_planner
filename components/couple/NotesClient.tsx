"use client";

import { useEffect, useRef, useState } from "react";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import type { Note } from "@/lib/couple/notes";
import { deriveNoteDisplay, formatRelativeDay, formatSavedAt } from "@/lib/couple/note-display";
import { Icon } from "@/components/venue/shell/Icon";
import { SprigIcon } from "@/components/seating/couple-icons";
import "@/components/seating/couple-seating.css";
import "./NotesClient.css";

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 900;

async function createNoteApi(title: string, content: string): Promise<Note> {
  return jsonOrThrow(
    await fetch("/api/couple/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() || null, content }),
    })
  );
}
async function updateNoteApi(id: string, title: string, content: string): Promise<Note> {
  return jsonOrThrow(
    await fetch(`/api/couple/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() || null, content }),
    })
  );
}
async function deleteNoteApi(id: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/couple/notes/${id}`, { method: "DELETE" }));
}

function isBlank(title: string, content: string): boolean {
  return title.trim() === "" && content.trim() === "";
}

function matchesSearch(note: Note, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const display = deriveNoteDisplay(note.title, note.content);
  return display.title.toLowerCase().includes(q) || note.content.toLowerCase().includes(q);
}

export function NotesClient({ coupleNames, initialNotes }: { coupleNames: string; initialNotes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [search, setSearch] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped whenever the active draft's identity changes (reset or switching
  // to a different note). A scheduled autosave captures the generation at
  // schedule time and, on completion, only applies setDraftId if it's still
  // current — otherwise clicking Save/selecting another note in the narrow
  // window while a debounced autosave is in flight could let that stale
  // completion overwrite whichever new draft the user has since moved to.
  const generationRef = useRef(0);

  // Mirrors draft state for the unmount-flush effect, which must read the
  // latest values from refs rather than depend on them directly — an effect
  // keyed on those values would re-run its cleanup on every keystroke, not
  // just on unmount (a bug caught in the single-note version of this file).
  const draftIdRef = useRef(draftId);
  const draftTitleRef = useRef(draftTitle);
  const draftContentRef = useRef(draftContent);
  useEffect(() => {
    draftIdRef.current = draftId;
    draftTitleRef.current = draftTitle;
    draftContentRef.current = draftContent;
  }, [draftId, draftTitle, draftContent]);

  /** Create/update/delete the given note state, syncing it into `notes`. */
  async function persist(id: string | null, title: string, content: string): Promise<Note | null> {
    if (id) {
      if (isBlank(title, content)) {
        await deleteNoteApi(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        return null;
      }
      const updated = await updateNoteApi(id, title, content);
      setNotes((prev) => [updated, ...prev.filter((n) => n.id !== id)]);
      return updated;
    }
    if (isBlank(title, content)) return null;
    const created = await createNoteApi(title, content);
    setNotes((prev) => [created, ...prev]);
    return created;
  }

  function resetDraft() {
    generationRef.current += 1;
    setDraftId(null);
    setDraftTitle("");
    setDraftContent("");
    setLastSavedAt(null);
    setSaveState("idle");
    setError(null);
  }

  function scheduleAutosave(nextId: string | null, title: string, content: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const generation = generationRef.current;
    timeoutRef.current = setTimeout(async () => {
      setSaveState("saving");
      setError(null);
      try {
        const result = await persist(nextId, title, content);
        if (generationRef.current !== generation) return; // superseded — don't touch the new draft
        // Only a brand-new note changes id (null -> created id); an edit to
        // an already-saved note keeps the same id, and an edit that emptied
        // the note out clears it, matching resetDraft's null state.
        if (result && result.id !== nextId) setDraftId(result.id);
        setLastSavedAt(result?.updated_at ?? null);
        setSaveState((current) => (current === "saving" ? "saved" : current));
      } catch (err) {
        if (generationRef.current !== generation) return;
        setError(err instanceof Error ? err.message : "Не успеа зачувувањето на белешката.");
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
  }

  function handleTitleChange(value: string) {
    setDraftTitle(value);
    setSaveState("pending");
    scheduleAutosave(draftId, value, draftContent);
  }
  function handleContentChange(value: string) {
    setDraftContent(value);
    setSaveState("pending");
    scheduleAutosave(draftId, draftTitle, value);
  }

  /** Persists the current draft right now instead of waiting on the debounce. */
  async function flushDraft() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (saveState !== "pending") return;
    setSaveState("saving");
    setError(null);
    try {
      const result = await persist(draftId, draftTitle, draftContent);
      if (result && result.id !== draftId) setDraftId(result.id);
      setLastSavedAt(result?.updated_at ?? null);
      setSaveState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на белешката.");
      setSaveState("error");
    }
  }

  async function handleSaveAndNew() {
    await flushDraft();
    resetDraft();
  }

  async function handleDelete() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (draftId) {
      setError(null);
      try {
        await deleteNoteApi(draftId);
        setNotes((prev) => prev.filter((n) => n.id !== draftId));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не успеа бришењето на белешката.");
        return;
      }
    }
    resetDraft();
  }

  async function handleSelectNote(note: Note) {
    if (note.id === draftId) return;
    await flushDraft();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    generationRef.current += 1;
    setDraftId(note.id);
    setDraftTitle(note.title ?? "");
    setDraftContent(note.content);
    setLastSavedAt(note.updated_at);
    setSaveState("idle");
    setError(null);
  }

  // Flush a pending edit on unmount/navigation instead of losing up to
  // AUTOSAVE_DELAY_MS of typing to an abandoned debounce timer. Mount-once
  // effect (empty deps) so this genuinely only fires on unmount, reading the
  // latest draft from refs rather than a stale closure.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        const id = draftIdRef.current;
        const title = draftTitleRef.current;
        const content = draftContentRef.current;
        if (!isBlank(title, content) || id) {
          if (id) {
            if (isBlank(title, content)) void deleteNoteApi(id);
            else void updateNoteApi(id, title, content);
          } else {
            void createNoteApi(title, content);
          }
        }
      }
    };
  }, []);

  const statusLabel =
    saveState === "saving"
      ? "Се зачувува..."
      : saveState === "pending"
        ? "Незачувани промени"
        : saveState === "error"
          ? "Не успеа зачувувањето"
          : lastSavedAt
            ? `Последно зачувано: ${formatSavedAt(lastSavedAt)}`
            : "";

  const canDelete = draftId !== null || !isBlank(draftTitle, draftContent);
  const filteredNotes = notes.filter((n) => matchesSearch(n, search));

  return (
    <div className="cs-page nt">
      <header className="cs-head">
        <SprigIcon className="cs-head-sprig" />
        <div className="cs-head-text">
          <p className="cs-eyebrow">{coupleNames}</p>
          <h2 className="cs-title">Белешки</h2>
          <p className="nt-sub">Запишете идеи, прашања и важни детали</p>
        </div>
      </header>

      <section className="cs-card nt-top">
        <SprigIcon className="nt-top-sprig" />
        <span className="nt-top-ic">
          <Icon name="note" size="md" />
        </span>
        <p className="nt-top-count">
          <b>{notes.length}</b> {notes.length === 1 ? "зачувана белешка" : "зачувани белешки"}
        </p>
        <label className="cs-search nt-top-search">
          <Icon name="search" size="sm" className="cs-search-ic" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пребарај белешки..." aria-label="Пребарај белешки" />
        </label>
      </section>

      <div className="nt-grid">
        <section className="cs-card nt-list" aria-labelledby="nt-list-h">
          <div className="nt-card-head">
            <h2 id="nt-list-h" className="nt-card-title">
              Мои белешки
            </h2>
            <button type="button" className="cs-btn cs-btn-primary" onClick={handleSaveAndNew}>
              <Icon name="plus" size="sm" />
              Нова белешка
            </button>
          </div>

          {filteredNotes.length === 0 ? (
            <p className="nt-empty">{notes.length === 0 ? "Сè уште нема зачувани белешки." : "Нема белешки што одговараат на пребарувањето."}</p>
          ) : (
            <div className="nt-rows">
              {filteredNotes.map((note) => {
                const display = deriveNoteDisplay(note.title, note.content);
                const isActive = note.id === draftId;
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => handleSelectNote(note)}
                    className={`nt-row${isActive ? " is-active" : ""}`}
                  >
                    <span className="nt-row-ic">
                      <Icon name="note" size="sm" />
                    </span>
                    <span className="nt-row-main">
                      <span className="nt-row-top">
                        <span className="nt-row-title">{display.title}</span>
                        <span className="nt-row-date">Ажурирано {formatRelativeDay(note.updated_at)}</span>
                      </span>
                      {display.preview ? <span className="nt-row-preview">{display.preview}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="cs-card nt-editor">
          <div className="nt-field">
            <label className="lab-s" htmlFor="note-title">
              Наслов
            </label>
            <input
              id="note-title"
              className="fld"
              value={draftTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Наслов на белешката"
            />
          </div>
          <div className="nt-field">
            <label className="lab-s" htmlFor="note-content">
              Белешка
            </label>
            <textarea
              id="note-content"
              className="fld nt-textarea"
              rows={10}
              value={draftContent}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Прашања за добавувачи, идеи, работи што треба да ги прашате локалот — запишете било што тука."
            />
          </div>

          <div className="nt-meta-row">
            <p className={`nt-status${saveState === "error" ? " is-error" : ""}`}>{statusLabel}</p>
            {saveState === "error" ? (
              <button type="button" onClick={flushDraft} className="cs-btn" style={{ padding: "4px 12px" }}>
                Обиди се повторно
              </button>
            ) : null}
          </div>
          {error ? <p className="cs-error">{error}</p> : null}

          <div className="nt-actions">
            <button type="button" onClick={handleDelete} disabled={!canDelete} className="cs-btn">
              <Icon name="trash" size="sm" />
              Избриши
            </button>
            <div className="nt-actions-right">
              <button type="button" onClick={handleSaveAndNew} className="cs-btn">
                Зачувај и нова
              </button>
              <button type="button" onClick={flushDraft} className="cs-btn cs-btn-primary">
                Зачувај
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
