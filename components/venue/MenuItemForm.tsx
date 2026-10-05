"use client";

import { useState } from "react";
import { addMenuItem, updateMenuItem, uploadMenuItemPhoto, type MenuItem, type MenuItemTier } from "@/lib/venue/menus";
import { AllergenTagEditor } from "@/components/venue/dashboard/AllergenTagEditor";
import { errorMessage } from "@/lib/venue/user-error";

export function MenuItemForm({
  venueId,
  defaultTier,
  onSaved,
}: {
  venueId: string;
  defaultTier: MenuItemTier;
  onSaved: () => void;
}) {
  const [tiers, setTiers] = useState<MenuItemTier[]>([defaultTier]);
  const [name, setName] = useState("");
  const [course, setCourse] = useState<MenuItem["course"]>("main");
  const [allergenTags, setAllergenTags] = useState<string[]>([]);
  const [isVegetarian, setIsVegetarian] = useState(false);
  const [isVegan, setIsVegan] = useState(false);
  const [price, setPrice] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleTier(value: MenuItemTier) {
    setTiers((current) =>
      current.includes(value) ? current.filter((t) => t !== value) : [...current, value]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (tiers.length === 0) {
      setError("Изберете барем еден вид мени.");
      return;
    }
    setIsSubmitting(true);
    try {
      const item = await addMenuItem({
        venue_id: venueId,
        tiers,
        course,
        name,
        allergen_tags: allergenTags,
        is_vegetarian: isVegetarian,
        is_vegan: isVegan,
        price: price === "" ? null : Number(price),
      });

      if (photoFile) {
        const photoPath = await uploadMenuItemPhoto(venueId, item.id, photoFile);
        await updateMenuItem(item.id, {
          tiers: item.tiers,
          course: item.course,
          name: item.name,
          allergen_tags: item.allergen_tags,
          is_vegetarian: item.is_vegetarian,
          is_vegan: item.is_vegan,
          price: item.price,
          photo_path: photoPath,
        });
      }

      onSaved();
      setName("");
      setTiers([defaultTier]);
      setAllergenTags([]);
      setPrice("");
      setPhotoFile(null);
    } catch (err) {
      setError(errorMessage(err, "Не успеа додавањето на јадењето. Обидете се повторно."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="ev-form">
      <div className="ev-form-grid">
        <div className="ev-field ev-field-wide">
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
          <span className="lab-s">Вид мени</span>
          <div style={{ display: "flex", gap: 16, paddingTop: 4 }}>
            <div className="ev-check">
              <input
                id="new-item-tier-everyday"
                type="checkbox"
                checked={tiers.includes("everyday")}
                onChange={() => toggleTier("everyday")}
              />
              <label htmlFor="new-item-tier-everyday">Секојдневно</label>
            </div>
            <div className="ev-check">
              <input
                id="new-item-tier-special"
                type="checkbox"
                checked={tiers.includes("special")}
                onChange={() => toggleTier("special")}
              />
              <label htmlFor="new-item-tier-special">Специјално</label>
            </div>
          </div>
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="new-item-course">
            Категорија
          </label>
          <select id="new-item-course" className="fld" value={course} onChange={(e) => setCourse(e.target.value as MenuItem["course"])}>
            <option value="starter">Предјадење</option>
            <option value="main">Главно јадење</option>
            <option value="dessert">Десерт</option>
            <option value="other">Друго</option>
          </select>
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="new-item-price">
            Цена
          </label>
          <input
            id="new-item-price"
            className="fld"
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="ev-field">
          <label className="lab-s" htmlFor="new-item-photo">
            Фотографија
          </label>
          <input id="new-item-photo" className="fld" type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="ev-field ev-field-wide">
          <label className="lab-s">Алергени</label>
          <AllergenTagEditor tags={allergenTags} onChange={setAllergenTags} />
        </div>
        <div className="ev-check">
          <input id="new-item-veg" type="checkbox" checked={isVegetarian} onChange={(e) => setIsVegetarian(e.target.checked)} />
          <label htmlFor="new-item-veg">Вегетаријанско</label>
        </div>
        <div className="ev-check">
          <input id="new-item-vegan" type="checkbox" checked={isVegan} onChange={(e) => setIsVegan(e.target.checked)} />
          <label htmlFor="new-item-vegan">Веганско</label>
        </div>
      </div>
      {error ? <p style={{ color: "var(--bad)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
      <button type="submit" className="btn btn-gold" disabled={isSubmitting}>
        {isSubmitting ? "Се додава..." : "Додади јадење"}
      </button>
    </form>
  );
}
