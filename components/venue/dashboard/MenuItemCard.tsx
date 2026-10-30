"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { ImageLightbox } from "./ImageLightbox";
import { AllergenTagEditor } from "./AllergenTagEditor";
import { CourseChips } from "./CourseChips";
import { DietToggles } from "./DietToggles";
import { DishPreviewRow } from "./DishPreviewRow";
import { PhotoDropzone } from "./PhotoDropzone";
import { Icon } from "@/components/venue/shell/Icon";
import {
  deleteMenuItem,
  getMenuItemPhotoUrl,
  updateMenuItem,
  uploadMenuItemPhoto,
  type MenuItem,
  type MenuItemUpdateInput,
} from "@/lib/venue/menus";
import { COURSE_META, formatPrice } from "@/lib/venue/menu-display";
import { errorMessage } from "@/lib/venue/user-error";

export function DietTags({ item }: { item: Pick<MenuItem, "is_vegetarian" | "is_vegan"> }) {
  return (
    <>
      {item.is_vegetarian ? (
        <span className="mp-tag">
          <Icon name="leaf" size="sm" /> вегетаријанско
        </span>
      ) : null}
      {item.is_vegan ? (
        <span className="mp-tag">
          <Icon name="sprout" size="sm" /> веганско
        </span>
      ) : null}
    </>
  );
}

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
          // Only the row's own keys: Enter on the photo button inside must
          // open the photo, not also the edit window. Space would otherwise
          // scroll the page, as it does for any non-<button> element.
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        className="mp-dish-row"
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
            <img src={photoUrl} alt={item.name} className="mp-th" style={{ width: 42, height: 42 }} />
          </button>
        ) : (
          <div className="mp-th">
            <Icon name={COURSE_META[item.course].icon} size="md" />
          </div>
        )}
        <div className="mp-dish-row-main">
          <span className="mp-dish-name">{item.name}</span>
          <DietTags item={item} />
          <span className="mp-lead" />
          {item.price !== null ? <span className="mp-price">{formatPrice(item.price)}</span> : null}
        </div>
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

  async function handlePhotoSelected(file: File) {
    setError(null);
    setIsUploadingPhoto(true);
    try {
      const path = await uploadMenuItemPhoto(venueId, item.id, file);
      setPhotoPath(path);
    } catch (err) {
      setError(errorMessage(err, "Не успеа прикачувањето на фотографијата. Обидете се повторно."));
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
        tiers: item.tiers,
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
      setError(errorMessage(err, "Не успеа зачувувањето на промените. Обидете се повторно."));
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
      setError(errorMessage(err, "Не успеа бришењето на јадењето. Обидете се повторно."));
      setIsDeleting(false);
    }
  }

  const photoUrl = getMenuItemPhotoUrl(photoPath);

  return (
    <Modal title={item.name} onClose={onClose}>
      <form onSubmit={handleSave} className="ev-form">
        <PhotoDropzone
          previewUrl={photoUrl}
          onFileSelected={handlePhotoSelected}
          isUploading={isUploadingPhoto}
          onViewClick={photoUrl ? () => setIsPhotoOpen(true) : undefined}
        />
        {isPhotoOpen && photoUrl ? <ImageLightbox src={photoUrl} alt={name} onClose={() => setIsPhotoOpen(false)} /> : null}

        <div className="ev-field">
          <label className="lab-s" htmlFor="edit-item-name">Име</label>
          <input id="edit-item-name" className="fld" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="ev-field">
          <label className="lab-s">Категорија</label>
          <CourseChips value={course} onChange={setCourse} />
        </div>
        <div className="ev-field" style={{ maxWidth: 160 }}>
          <label className="lab-s" htmlFor="edit-item-price">Цена</label>
          <div className="mp-price-field">
            <input id="edit-item-price" className="fld" type="number" min={0} step="1" value={price} onChange={(e) => setPrice(e.target.value)} />
            <span>ден</span>
          </div>
        </div>
        <div className="ev-field">
          <label className="lab-s">Алергени</label>
          <AllergenTagEditor tags={allergenTags} onChange={setAllergenTags} />
        </div>
        <div className="ev-field">
          <label className="lab-s">Исхрана</label>
          <DietToggles isVegetarian={isVegetarian} onVegetarianChange={setIsVegetarian} isVegan={isVegan} onVeganChange={setIsVegan} />
        </div>

        <DishPreviewRow
          name={name}
          course={course}
          price={price === "" ? null : Number(price)}
          isVegetarian={isVegetarian}
          isVegan={isVegan}
          photoPreviewUrl={photoUrl}
        />

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
