"use client";

import { useState } from "react";
import { Icon } from "@/components/venue/shell/Icon";
import { DietTags } from "./MenuItemCard";
import {
  countEventsUsingTemplate,
  createMenuTemplate,
  deleteMenuTemplate,
  getMenuItemPhotoUrl,
  packageInPastEventsMessage,
  packageInUpcomingEventsMessage,
  setMenuTemplateItems,
  updateMenuTemplate,
  type MenuItem,
  type MenuTemplate,
} from "@/lib/venue/menus";
import { COURSE_META, COURSE_ORDER, filterDishes, formatPrice, type DishFilter } from "@/lib/venue/menu-display";
import { errorMessage } from "@/lib/venue/user-error";

function groupByCourse(ids: Set<string>, items: MenuItem[]): [MenuItem["course"], MenuItem[]][] {
  return COURSE_ORDER.map(
    (course): [MenuItem["course"], MenuItem[]] => [course, items.filter((item) => ids.has(item.id) && item.course === course)]
  ).filter(([, dishes]) => dishes.length > 0);
}

/**
 * The package editor doubles as the "create a package" flow: for a brand
 * new package `template` is null and Save calls createMenuTemplate instead
 * of updateMenuTemplate — otherwise it's the same unified name/description/
 * items editor.
 */
export function PackageBuilder({
  venueId,
  template,
  initialItemIds,
  items,
  onClose,
  onChanged,
  onSave,
  allowDelete = true,
}: {
  venueId: string;
  template: MenuTemplate | null;
  initialItemIds: string[];
  items: MenuItem[];
  onClose: () => void;
  onChanged: () => void;
  /** Used instead of create/update when given (the event's custom menu is
   * saved through a server route). */
  onSave?: (input: { name: string; description: string | null; itemIds: string[] }) => Promise<void>;
  /** False hides the delete control. */
  allowDelete?: boolean;
}) {
  const [name, setName] = useState(template?.name || (onSave ? "Сопствено мени" : ""));
  const [description, setDescription] = useState(template?.description ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(initialItemIds));
  const [filter, setFilter] = useState<DishFilter>("all");
  const [isOver, setIsOver] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // How many upcoming/past events use this package; null while unknown.
  const [eventsUsing, setEventsUsing] = useState<{ upcoming: number; past: number } | null>(null);
  // Custom-menu mode (the event's own menu): no description, menu wording.
  const customMode = Boolean(onSave);
  const defaultName = customMode ? "Сопствено мени" : "Нов пакет";
  // A new package created by an earlier save attempt whose dishes then
  // failed: a retry updates it instead of creating a duplicate.
  const [createdTemplate, setCreatedTemplate] = useState<MenuTemplate | null>(null);

  function toggle(itemId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsOver(false);
    const itemId = e.dataTransfer.getData("text/plain");
    if (itemId && !selectedIds.has(itemId)) toggle(itemId);
  }

  async function handleSave() {
    setSaveError(null);
    setIsSaving(true);
    try {
      const finalName = name.trim() || defaultName;
      if (onSave) {
        const itemIds = Array.from(selectedIds).filter((id) => items.some((item) => item.id === id));
        await onSave({ name: finalName, description: null, itemIds });
        onChanged();
        onClose();
        return;
      }
      const existing = template ?? createdTemplate;
      let savedTemplate: MenuTemplate;
      if (existing) {
        savedTemplate = await updateMenuTemplate(existing.id, finalName, description || null);
      } else {
        savedTemplate = await createMenuTemplate(venueId, finalName, description);
        setCreatedTemplate(savedTemplate);
      }
      // Only dishes that still exist: one deleted since the builder opened
      // would make the whole save fail.
      const itemIds = Array.from(selectedIds).filter((id) => items.some((item) => item.id === id));
      await setMenuTemplateItems(savedTemplate.id, itemIds);
      onChanged();
      onClose();
    } catch (err) {
      setSaveError(errorMessage(err, "Не успеа зачувувањето на пакетот. Обидете се повторно."));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!template) return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteMenuTemplate(template.id);
      onChanged();
      onClose();
    } catch (err) {
      setDeleteError(errorMessage(err, "Не успеа бришењето на пакетот. Обидете се повторно."));
      setIsDeleting(false);
    }
  }

  const veg = Array.from(selectedIds).filter((id) => items.find((i) => i.id === id)?.is_vegetarian).length;
  const total = Array.from(selectedIds).reduce((sum, id) => sum + (items.find((i) => i.id === id)?.price ?? 0), 0);
  const visibleItems = filterDishes(items, filter);
  const previewGroups = groupByCourse(selectedIds, items);

  return (
    <div className="ev-sections">
      <div className="mp-ed-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            className="mp-nm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Име на пакетот"
            aria-label="Име на пакетот"
          />
          {customMode ? null : (
            <input
              className="mp-ds"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Краток опис, пр. За гости на пост"
              aria-label="Опис"
            />
          )}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: "none" }}>
          {template && allowDelete ? (
            confirmingDelete ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, flexWrap: "wrap" }}>
                {eventsUsing && eventsUsing.upcoming > 0 ? (
                  <span role="alert" style={{ color: "var(--bad)" }}>
                    {packageInUpcomingEventsMessage(eventsUsing.upcoming)}
                  </span>
                ) : eventsUsing && eventsUsing.past > 0 ? (
                  <span role="alert" style={{ color: "var(--bad)" }}>
                    {packageInPastEventsMessage(eventsUsing.past)}
                  </span>
                ) : null}
                {eventsUsing && eventsUsing.upcoming > 0 ? null : (
                  <button type="button" onClick={handleDelete} disabled={isDeleting} className="btn btn-ghost" style={{ color: "var(--bad)" }}>
                    <Icon name="trash" size="sm" /> {isDeleting ? "Се брише..." : "Потврди бришење"}
                  </button>
                )}
                <button type="button" onClick={() => setConfirmingDelete(false)} disabled={isDeleting} className="btn btn-ghost">
                  Откажи
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConfirmingDelete(true);
                  setEventsUsing(null);
                  if (template) {
                    countEventsUsingTemplate(template.id)
                      .then(setEventsUsing)
                      .catch(() => setEventsUsing(null));
                  }
                }}
                className="btn btn-ghost"
                style={{ color: "var(--bad)", whiteSpace: "nowrap" }}
              >
                <Icon name="trash" size="sm" /> Избриши пакет
              </button>
            )
          ) : null}
          <button type="button" onClick={onClose} aria-label="Затвори" className="modal-close">
            <Icon name="x" size="sm" />
          </button>
        </div>
      </div>
      {deleteError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{deleteError}</p> : null}

      <div className="mp-edgrid">
        <div className="mp-pool">
          <div style={{ padding: "14px 14px 0" }}>
            <p className="mp-lab" style={{ marginBottom: 10 }}>
              ЈАДЕЊА · ВЛЕЧИ ИЛИ ДОДАЈ
            </p>
            <div className="mp-chips">
              <button type="button" className="mp-chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
                Сите
              </button>
              {COURSE_ORDER.filter((course) => course !== "other").map((course) => (
                <button key={course} type="button" className="mp-chip" aria-pressed={filter === course} onClick={() => setFilter(course)}>
                  {COURSE_META[course].label}
                </button>
              ))}
              <button type="button" className="mp-chip" aria-pressed={filter === "posno"} onClick={() => setFilter("posno")}>
                Посно
              </button>
            </div>
          </div>
          <div>
            {visibleItems.map((item) => {
              const inPackage = selectedIds.has(item.id);
              const photoUrl = getMenuItemPhotoUrl(item.photo_path);
              return (
                <div
                  key={item.id}
                  className="mp-er"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
                  data-testid={`pkg-available-${item.id}`}
                >
                  <Icon name="grip" size="sm" />
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="" className="mp-th" style={{ width: 34, height: 34 }} />
                  ) : (
                    <div className="mp-th" style={{ width: 34, height: 34 }}>
                      <Icon name={COURSE_META[item.course].icon} size="sm" />
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 14, color: "var(--ink)" }}>{item.name}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--muted-2, var(--muted))" }}>
                      {COURSE_META[item.course].label}
                      {item.price !== null ? ` · ${formatPrice(item.price)}` : ""}
                      <DietTags item={item} />
                    </p>
                  </div>
                  <button type="button" className={`mp-add${inPackage ? " in" : ""}`} onClick={() => toggle(item.id)} data-testid={`pkg-toggle-${item.id}`}>
                    {inPackage ? "✓ Во пакетот" : "+ Додај"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className={`mp-drop${isOver ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsOver(true);
          }}
          onDragLeave={() => setIsOver(false)}
          onDrop={handleDrop}
          data-testid="pkg-dropzone"
        >
          <div className="mp-drop-inner">
            <p className="mp-pk-name" style={{ color: name ? "var(--ink)" : "var(--faint)" }}>
              {name || defaultName}
            </p>
            {customMode ? null : <p className="mp-pk-desc">{description}</p>}
            <div className="mp-divider">
              <span />
              <i />
              <span />
            </div>
            {previewGroups.length === 0 ? (
              <p style={{ margin: "22px 0", fontSize: 13, color: "var(--muted-2, var(--muted))" }}>Додајте или довлечете јадења тука</p>
            ) : (
              previewGroups.map(([course, dishes]) => (
                <div key={course}>
                  <p className="mp-lab mp-pk-course">{COURSE_META[course].label.toUpperCase()}</p>
                  {dishes.map((item) => (
                    <div key={item.id} className="mp-drop-dish" data-testid={`pkg-selected-${item.id}`}>
                      <span className="mp-pk-dish">{item.name}</span>
                      <button
                        type="button"
                        onClick={() => toggle(item.id)}
                        aria-label={`Отстрани ${item.name}`}
                        style={{ border: 0, background: "none", padding: 0, cursor: "pointer", color: "var(--faint)", display: "inline-flex" }}
                      >
                        <Icon name="x" size="sm" />
                      </button>
                    </div>
                  ))}
                </div>
              ))
            )}
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 16, paddingTop: 12, fontSize: 12, color: "var(--muted)" }}>
              {selectedIds.size} јадења · {veg} вегетаријански
              <br />
              <span style={{ color: "var(--gold-text, var(--gold))" }}>≈ {formatPrice(total)} по гостин</span>
            </div>
            {saveError ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: "8px 0 0" }}>{saveError}</p> : null}
            <button type="button" className="btn btn-gold" style={{ width: "100%", marginTop: 14 }} onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Се зачувува..." : customMode ? "Зачувај мени" : "Зачувај пакет"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
