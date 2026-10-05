"use client";

import { useEffect, useRef, useState } from "react";
import { jsonOrThrow } from "@/lib/couple/client-utils";
import type { Note } from "@/lib/couple/notes";
import { deriveNoteDisplay } from "@/lib/couple/note-display";

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

export function NotesClient({ initialNotes }: { initialNotes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
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
  async function persist(id: string | null, title: string, content: string): Promise<string | null> {
    if (id) {
      if (isBlank(title, content)) {
        await deleteNoteApi(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        return null;
      }
      const updated = await updateNoteApi(id, title, content);
      setNotes((prev) => [updated, ...prev.filter((n) => n.id !== id)]);
      return updated.id;
    }
    if (isBlank(title, content)) return null;
    const created = await createNoteApi(title, content);
    setNotes((prev) => [created, ...prev]);
    return created.id;
  }

  function resetDraft() {
    generationRef.current += 1;
    setDraftId(null);
    setDraftTitle("");
    setDraftContent("");
    setSaveState("idle");
  }

  function scheduleAutosave(nextId: string | null, title: string, content: string) {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const generation = generationRef.current;
    timeoutRef.current = setTimeout(async () => {
      setSaveState("saving");
      setError(null);
      try {
        const resultId = await persist(nextId, title, content);
        if (generationRef.current !== generation) return; // superseded — don't touch the new draft
        // Only a brand-new note changes id (null -> created id); an edit to
        // an already-saved note keeps the same id, and an edit that emptied
        // the note out clears it, matching resetDraft's null state.
        if (resultId !== nextId) setDraftId(resultId);
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
      await persist(draftId, draftTitle, draftContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на белешката.");
      setSaveState("error");
    }
  }

  async function handleSave() {
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
        : saveState === "saved"
          ? "Зачувано"
          : saveState === "error"
            ? "Не успеа зачувувањето"
            : "";

  const canDelete = draftId !== null || !isBlank(draftTitle, draftContent);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 720 }}>
      <div className="ev" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <input
          value={draftTitle}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Наслов" aria-label="Наслов"
          style={{
            border: 0,
            borderBottom: "1px solid var(--line)",
            background: "none",
            fontSize: 16,
            fontWeight: 700,
            padding: "2px 2px 8px",
            outline: "none",
          }}
        />
        <textarea
          className="fld"
          value={draftContent}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Прашања за добавувачи, идеи, работи што треба да ги прашате локалот — запишете било што тука." aria-label="Прашања за добавувачи, идеи, работи што треба да ги прашате локалот — запишете било што тука."
          rows={10}
          style={{ resize: "vertical", minHeight: 180, lineHeight: 1.6, border: 0, padding: "2px" }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontSize: 12.5, color: saveState === "error" ? "var(--bad)" : "var(--muted)" }}>
            {statusLabel}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            {saveState === "error" ? (
              <button type="button" onClick={flushDraft} className="btn btn-ghost" style={{ padding: "4px 12px" }}>
                Обиди се повторно
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canDelete}
              className="btn btn-ghost"
              style={{ padding: "4px 12px", color: canDelete ? "var(--bad)" : undefined }}
            >
              Избриши
            </button>
            <button type="button" onClick={handleSave} className="btn btn-gold" style={{ padding: "4px 14px" }}>
              Зачувај и нова
            </button>
          </div>
        </div>
        {error ? <p style={{ color: "var(--bad)", fontSize: 12.5, margin: 0 }}>{error}</p> : null}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {notes.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>Сè уште нема зачувани белешки.</p>
        ) : (
          notes.map((note) => {
            const display = deriveNoteDisplay(note.title, note.content);
            const isActive = note.id === draftId;
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => handleSelectNote(note)}
                className="ev"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: isActive ? "var(--gold)" : undefined,
                }}
              >
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>{display.title}</p>
                {display.preview ? (
                  <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--muted)" }}>{display.preview}</p>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
