"use client";

import { Icon } from "@/components/venue/shell/Icon";
import { getMenuItemPhotoUrl } from "@/lib/venue/menus";
import { COURSE_META, COURSE_ORDER } from "@/lib/venue/menu-display";

export interface MenuDetailItem {
  id: string;
  name: string;
  course: string;
  photo_path: string | null;
  price?: number | null;
  is_vegetarian?: boolean;
  is_vegan?: boolean;
}

function courseLabel(course: string): string {
  return (COURSE_META[course as keyof typeof COURSE_META] ?? COURSE_META.other).label;
}

const Divider = () => (
  <div className="mp-divider">
    <span />
    <i />
    <span />
  </div>
);

/** The ivory double-border "printed menu" card — shared by the read-only
 * MenuDetailModal and the event wizard's flip-through menu preview. */
export function MenuCardContent({
  title,
  description,
  items,
  onPhotoClick,
  footer,
}: {
  title: string;
  description?: string | null;
  items: MenuDetailItem[];
  onPhotoClick: (src: string, alt: string) => void;
  footer?: React.ReactNode;
}) {
  const groups = COURSE_ORDER.map((course) => [course, items.filter((item) => item.course === course)] as const).filter(
    ([, dishes]) => dishes.length > 0
  );
  const knownIds = new Set(groups.flatMap(([, dishes]) => dishes.map((d) => d.id)));
  const other = items.filter((item) => !knownIds.has(item.id));
  const allGroups = other.length ? [...groups, ["other", other] as const] : groups;

  return (
    <div className="mp-menu-card">
      <div className="mp-pk-inner">
        <p className="mp-pk-name">{title}</p>
        {description ? <p className="mp-pk-desc">{description}</p> : null}
        <Divider />
        {allGroups.length === 0 ? (
          <p className="ev-hint">Нема јадења во ова мени.</p>
        ) : (
          allGroups.map(([course, dishes]) => (
            <div key={course}>
              <p className="mp-lab mp-pk-course">{courseLabel(course).toUpperCase()}</p>
              {dishes.map((item) => {
                const photoUrl = getMenuItemPhotoUrl(item.photo_path);
                return (
                  <div key={item.id} className="mp-menu-dish-row">
                    <span className="mp-pk-dish">{item.name}</span>
                    {photoUrl ? (
                      <button
                        type="button"
                        className="mp-menu-dish-photo-btn"
                        onClick={() => onPhotoClick(photoUrl, item.name)}
                        aria-label={`Погледни фотографија на ${item.name}`}
                      >
                        <Icon name="photo" size="sm" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))
        )}
        {footer ? (
          <>
            <Divider />
            {footer}
          </>
        ) : null}
      </div>
    </div>
  );
}
