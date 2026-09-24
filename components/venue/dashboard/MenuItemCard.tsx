"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { ImageLightbox } from "./ImageLightbox";
import { AllergenTagEditor } from "./AllergenTagEditor";
import { Icon } from "@/components/venue/shell/Icon";
import {
  deleteMenuItem,
  getMenuItemPhotoUrl,
  updateMenuItem,
  uploadMenuItemPhoto,
  type MenuItem,
  type MenuItemTier,
  type MenuItemUpdateInput,
} from "@/lib/venue/menus";

const COURSE_LABELS: Record<MenuItem["course"], string> = {
  starter: "Предјадење",
  main: "Главно јадење",
  dessert: "Десерт",
  other: "Друго",
};

export function MenuItemCard({
  item,
  venueId,
  onChanged,
  draggable,
  onDragStart,
}: {
  item: MenuItem;
  venueId: string;
  onChanged: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);
  const photoUrl = getMenuItemPhotoUrl(item.photo_path);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        draggable={draggable}
        onDragStart={onDragStart}
        onClick={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setIsOpen(true);
        }}
        className="menu-item-row"
      >
        {photoUrl ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsPhotoOpen(true);
            }}
            aria-label={`Погледни фотографија на ${item.name}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt={item.name} className="menu-item-thumb" />
          </button>
        ) : (
          <div className="menu-item-thumb menu-item-thumb-empty" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <b>{item.name}</b>
          <span className="muted"> — {COURSE_LABELS[item.course]}</span>
          {item.is_vegan ? (
            <span className="pill p-ok" style={{ marginLeft: 8 }}>веганско</span>
          ) : item.is_vegetarian ? (
            <span className="pill p-ok" style={{ marginLeft: 8 }}>вегетаријанско</span>
          ) : null}
        </div>
        {item.price !== null ? <span style={{ fontFamily: "var(--data)", fontWeight: 700 }}>{item.price.toFixed(2)}</span> : null}
      </div>
      {isOpen ? <MenuItemDetailModal item={item} venueId={venueId} onClose={() => setIsOpen(false)} onChanged={onChanged} /> : null}
      {isPhotoOpen && photoUrl ? <ImageLightbox src={photoUrl} alt={item.name} onClose={() => setIsPhotoOpen(false)} /> : null}
    </>
  );
}

function MenuItemDetailModal({
  item,
  venueId,
  onClose,
  onChanged,
}: {
  item: MenuItem;
  venueId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [tier, setTier] = useState<MenuItemTier>(item.tier);
  const [course, setCourse] = useState<MenuItem["course"]>(item.course);
  const [allergenTags, setAllergenTags] = useState<string[]>(item.allergen_tags);
  const [isVegetarian, setIsVegetarian] = useState(item.is_vegetarian);
  const [isVegan, setIsVegan] = useState(item.is_vegan);
  const [price, setPrice] = useState(item.price !== null ? String(item.price) : "");
  const [photoPath, setPhotoPath] = useState(item.photo_path);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsUploadingPhoto(true);
    try {
      const path = await uploadMenuItemPhoto(venueId, item.id, file);
      setPhotoPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа прикачувањето на фотографијата. Обидете се повторно.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const input: MenuItemUpdateInput = {
        tier,
        course,
        name,
        allergen_tags: allergenTags,
        is_vegetarian: isVegetarian,
        is_vegan: isVegan,
        price: price === "" ? null : Number(price),
        photo_path: photoPath,
      };
      await updateMenuItem(item.id, input);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа зачувувањето на промените. Обидете се повторно.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setIsDeleting(true);
    try {
      await deleteMenuItem(item.id);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не успеа бришењето на јадењето. Обидете се повторно.");
      setIsDeleting(false);
    }
  }

  const photoUrl = getMenuItemPhotoUrl(photoPath);

  return (
    <Modal title={item.name} onClose={onClose}>
      <form onSubmit={handleSave} className="ev-form">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {photoUrl ? (
            <button type="button" onClick={() => setIsPhotoOpen(true)} aria-label={`Погледни фотографија на ${name}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt={name} style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover" }} />
            </button>
          ) : (
            <div className="menu-item-thumb menu-item-thumb-empty" style={{ width: 64, height: 64 }} />
          )}
          <label className="btn btn-ghost" style={{ cursor: "pointer" }}>
            {isUploadingPhoto ? "Се прикачува..." : "Смени фотографија"}
            <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ display: "none" }} />
          </label>
        </div>
        {isPhotoOpen && photoUrl ? <ImageLightbox src={photoUrl} alt={name} onClose={() => setIsPhotoOpen(false)} /> : null}

        <div className="ev-form-grid">
          <div className="ev-field ev-field-wide">
            <label className="lab-s" htmlFor="edit-item-name">Име</label>
            <input id="edit-item-name" className="fld" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="ev-field">
            <label className="lab-s" htmlFor="edit-item-tier">Вид мени</label>
            <select id="edit-item-tier" className="fld" value={tier} onChange={(e) => setTier(e.target.value as MenuItemTier)}>
              <option value="everyday">Секојдневно</option>
              <option value="special">Специјално</option>
            </select>
          </div>
          <div className="ev-field">
            <label className="lab-s" htmlFor="edit-item-course">Категорија</label>
            <select id="edit-item-course" className="fld" value={course} onChange={(e) => setCourse(e.target.value as MenuItem["course"])}>
              <option value="starter">Предјадење</option>
              <option value="main">Главно јадење</option>
              <option value="dessert">Десерт</option>
              <option value="other">Друго</option>
            </select>
          </div>
          <div className="ev-field">
            <label className="lab-s" htmlFor="edit-item-price">Цена</label>
            <input id="edit-item-price" className="fld" type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="ev-field ev-field-wide">
            <label className="lab-s">Алергени</label>
            <AllergenTagEditor tags={allergenTags} onChange={setAllergenTags} />
          </div>
          <div className="ev-check">
            <input id="edit-item-veg" type="checkbox" checked={isVegetarian} onChange={(e) => setIsVegetarian(e.target.checked)} />
            <label htmlFor="edit-item-veg">Вегетаријанско</label>
          </div>
          <div className="ev-check">
            <input id="edit-item-vegan" type="checkbox" checked={isVegan} onChange={(e) => setIsVegan(e.target.checked)} />
            <label htmlFor="edit-item-vegan">Веганско</label>
          </div>
        </div>

        {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <button type="submit" className="btn btn-gold" disabled={isSubmitting || isDeleting}>
            {isSubmitting ? "Се зачувува..." : "Зачувај промени"}
          </button>

          {confirmingDelete ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              Да се избрише јадењето?
              <button type="button" onClick={handleDelete} disabled={isDeleting} className="btn btn-ghost" style={{ color: "var(--bad)" }}>
                {isDeleting ? "Се брише..." : "Да, избриши"}
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={isDeleting} className="btn btn-ghost">
                Откажи
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className="btn btn-ghost" style={{ color: "var(--bad)" }}>
              <Icon name="trash" size="sm" /> Избриши јадење
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
