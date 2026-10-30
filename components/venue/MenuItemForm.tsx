"use client";

import { useState } from "react";
import { addMenuItem, updateMenuItem, uploadMenuItemPhoto, type MenuItem } from "@/lib/venue/menus";
import { AllergenTagEditor } from "@/components/venue/dashboard/AllergenTagEditor";
import { CourseChips } from "@/components/venue/dashboard/CourseChips";
import { DietToggles } from "@/components/venue/dashboard/DietToggles";
import { DishPreviewRow } from "@/components/venue/dashboard/DishPreviewRow";
import { PhotoDropzone } from "@/components/venue/dashboard/PhotoDropzone";
import { errorMessage } from "@/lib/venue/user-error";

const PHOTO_FAILED = "Јадењето е зачувано, но фотографијата не се прикачи. Обидете се повторно или изберете друга фотографија.";

export function MenuItemForm({
  venueId,
  onSaved,
}: {
  venueId: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [course, setCourse] = useState<MenuItem["course"]>("main");
  const [allergenTags, setAllergenTags] = useState<string[]>([]);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [isVegan, setIsVegan] = useState(false);
  const [price, setPrice] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // The dish saved by an earlier attempt whose photo step then failed: a
  // retry updates it (and retries the photo) instead of adding a duplicate.
  const [createdItem, setCreatedItem] = useState<MenuItem | null>(null);

  function handlePhotoSelected(file: File) {
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const fields = {
      tiers: ["special"] as MenuItem["tiers"],
      course,
      name,
      allergen_tags: allergenTags,
      is_vegetarian: isVegetarian,
      is_vegan: isVegan,
      price: price === "" ? null : Number(price),
    };
    try {
      let item = createdItem;
      if (!item) {
        item = await addMenuItem({ venue_id: venueId, ...fields });
        setCreatedItem(item);
      } else if (!photoFile) {
        // Retrying without a photo: keep the dish, with whatever was edited since.
        item = await updateMenuItem(item.id, { ...fields, photo_path: item.photo_path });
      }

      if (photoFile) {
        try {
          const photoPath = await uploadMenuItemPhoto(venueId, item.id, photoFile);
          await updateMenuItem(item.id, { ...fields, photo_path: photoPath });
        } catch {
          throw new Error(PHOTO_FAILED);
        }
      }

      setCreatedItem(null);
      onSaved();
      setName("");
      setAllergenTags([]);
      setPrice("");
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
    } catch (err) {
      setError(errorMessage(err, "Не успеа додавањето на јадењето. Обидете се повторно."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ev-form">
      <p className="mp-dish-form-sub">Додадете јадење достапно за свадби, крштевки и други настани.</p>

      <div className="mp-dish-grid">
        <PhotoDropzone previewUrl={photoPreviewUrl} onFileSelected={handlePhotoSelected} />

        <div className="ev-form" style={{ gap: 14 }}>
          <div className="ev-field">
            <label className="lab-s" htmlFor="new-item-name">
              Име на јадењето <span className="req">*</span>
            </label>
            <input
              id="new-item-name"
              className="fld"
              placeholder="пр. Печено пиле"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="ev-field">
            <label className="lab-s">Категорија</label>
            <CourseChips value={course} onChange={setCourse} />
          </div>
          <div className="ev-field" style={{ maxWidth: 160 }}>
            <label className="lab-s" htmlFor="new-item-price">
              Цена
            </label>
            <div className="mp-price-field">
              <input
                id="new-item-price"
                className="fld"
                type="number"
                min={0}
                step="1"
                placeholder="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <span>ден</span>
            </div>
          </div>
        </div>
      </div>

      <div className="ev-field">
        <label className="lab-s">Алергени</label>
        <AllergenTagEditor tags={allergenTags} onChange={setAllergenTags} />
      </div>

      <div className="ev-field">
        <label className="lab-s">Исхрана</label>
        <DietToggles
          isVegetarian={isVegetarian}
          onVegetarianChange={setIsVegetarian}
          isVegan={isVegan}
          onVeganChange={setIsVegan}
        />
      </div>

      <DishPreviewRow
        name={name}
        course={course}
        price={price === "" ? null : Number(price)}
        isVegetarian={isVegetarian}
        isVegan={isVegan}
        photoPreviewUrl={photoPreviewUrl}
      />

      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
      <button type="submit" className="btn btn-gold" disabled={isSubmitting}>
        {isSubmitting ? "Се додава..." : "Додади јадење"}
      </button>
    </form>
  );
}
