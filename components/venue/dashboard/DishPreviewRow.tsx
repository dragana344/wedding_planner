"use client";

import { Icon } from "@/components/venue/shell/Icon";
import { DietTags } from "./MenuItemCard";
import { COURSE_META, formatPrice } from "@/lib/venue/menu-display";
import type { MenuItem } from "@/lib/venue/menus";

/** A read-only preview of how a dish will render in the Јадења list, used
 * while filling out the create/edit form so changes are visible immediately. */
export function DishPreviewRow({
  name,
  course,
  price,
  isVegetarian,
  isVegan,
  photoPreviewUrl,
}: {
  name: string;
  course: MenuItem["course"];
  price: number | null;
  isVegetarian: boolean;
  isVegan: boolean;
  photoPreviewUrl: string | null;
}) {
  return (
    <div>
      <p className="mp-lab" style={{ marginBottom: 8 }}>
        Вака ќе изгледа во менито
      </p>
      <div className="mp-preview-box">
        <div className="mp-dish-row">
          {photoPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoPreviewUrl} alt="" className="mp-th" style={{ width: 42, height: 42 }} />
          ) : (
            <div className="mp-th">
              <Icon name={COURSE_META[course].icon} size="md" />
            </div>
          )}
          <div className="mp-dish-row-main">
            <span className="mp-dish-name">{name.trim() || "Име на јадење..."}</span>
            <DietTags item={{ is_vegetarian: isVegetarian, is_vegan: isVegan }} />
            <span className="mp-lead" />
            <span className="mp-price">{formatPrice(price ?? 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
