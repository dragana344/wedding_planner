"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import {
  deleteMenuTemplate,
  listMenuTemplateItems,
  setMenuTemplateItems,
  updateMenuTemplate,
  type MenuItem,
  type MenuTemplateWithItemCount,
} from "@/lib/venue/menus";
import { errorMessage } from "@/lib/venue/user-error";

/**
 * A standard package menu is just a named, drag-and-drop-curated selection
 * of the venue's special-event pool — the same item (e.g. "Печено пиле")
 * can be dragged into several packages without ever being duplicated.
 */
export function PackageBuilder({
  template,
  specialItems,
  onClose,
  onChanged,
}: {
  template: MenuTemplateWithItemCount;
  specialItems: MenuItem[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    listMenuTemplateItems(template.id).then((items) => setSelectedIds(new Set(items.map((i) => i.id))));
  }, [template.id]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const itemId = e.dataTransfer.getData("text/plain");
    if (itemId) setSelectedIds((prev) => new Set(prev).add(itemId));
  }

  function removeItem(itemId: string) {
    setSelectedIds((prev) => {
      if (!prev) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    setIsSavingName(true);
    try {
      await updateMenuTemplate(template.id, name, description || null);
      setIsEditingName(false);
      onChanged();
    } catch (err) {
      setNameError(errorMessage(err, "Не успеа зачувувањето. Обидете се повторно."));
    } finally {
      setIsSavingName(false);
    }
  }

  async function handleSaveItems() {
    if (!selectedIds) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      await setMenuTemplateItems(template.id, Array.from(selectedIds));
      onChanged();
    } catch (err) {
      setSaveError(errorMessage(err, "Не успеа зачувувањето на јадењата. Обидете се повторно."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteMenuTemplate(template.id);
      onChanged();
      onClose();
    } catch (err) {
      setDeleteError(errorMessage(err, "Не успеа бришењето на менито. Обидете се повторно."));
      setIsDeleting(false);
    }
  }

  const selected = selectedIds
    ? specialItems.filter((item) => selectedIds.has(item.id))
    : [];
  const available = selectedIds
    ? specialItems.filter((item) => !selectedIds.has(item.id))
    : specialItems;

  return (
    <div className="ev-sections">
      {isEditingName ? (
        <form onSubmit={handleSaveName} className="ev-form">
          <div className="ev-form-grid">
            <div className="ev-field">
              <label className="lab-s" htmlFor="pkg-name">Име</label>
              <input id="pkg-name" className="fld" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="ev-field">
              <label className="lab-s" htmlFor="pkg-desc">Опис</label>
              <input id="pkg-desc" className="fld" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          {nameError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{nameError}</p> : null}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-gold" disabled={isSavingName}>
              {isSavingName ? "Се зачувува..." : "Зачувај"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setIsEditingName(false)} disabled={isSavingName}>
              Откажи
            </button>
          </div>
        </form>
      ) : (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            {template.description ? <p className="muted" style={{ margin: 0 }}>{template.description}</p> : null}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setIsEditingName(true)}>
              <Icon name="edit" size="sm" /> Преименувај
            </button>
            {confirmingDelete ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
                Да се избрише менито?
                <button type="button" onClick={handleDelete} disabled={isDeleting} className="btn btn-ghost" style={{ color: "var(--bad)" }}>
                  {isDeleting ? "Се брише..." : "Да, избриши"}
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="btn btn-ghost">
                  Откажи
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-ghost" style={{ color: "var(--bad)" }} onClick={() => setConfirmingDelete(true)}>
                <Icon name="trash" size="sm" /> Избриши мени
              </button>
            )}
          </div>
        </div>
      )}
      {deleteError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{deleteError}</p> : null}

      <div className="pkg-builder">
        <div>
          <p className="card-t" style={{ marginBottom: 10 }}>Специјално мени (влечи во менито)</p>
          <div className="pkg-pool">
            {available.length === 0 ? (
              <p className="ev-hint">Нема повеќе јадења за додавање.</p>
            ) : (
              available.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
                  className="pkg-item"
                  data-testid={`pkg-available-${item.id}`}
                >
                  <Icon name="move" size="sm" />
                  {item.name}
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <p className="card-t" style={{ marginBottom: 10 }}>{template.name}</p>
          <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} className="pkg-dropzone" data-testid="pkg-dropzone">
            {selected.length === 0 ? (
              <p className="ev-hint">Довлечи јадења овде.</p>
            ) : (
              selected.map((item) => (
                <div key={item.id} className="pkg-item pkg-item-selected" data-testid={`pkg-selected-${item.id}`}>
                  {item.name}
                  <button type="button" onClick={() => removeItem(item.id)} aria-label={`Отстрани ${item.name}`}>
                    <Icon name="x" size="sm" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {saveError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{saveError}</p> : null}
      <button type="button" className="btn btn-gold" onClick={handleSaveItems} disabled={isSaving || !selectedIds}>
        {isSaving ? "Се зачувува..." : "Зачувај јадења"}
      </button>
    </div>
  );
}
