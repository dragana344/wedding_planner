"use client";

import { COURSE_META, COURSE_ORDER } from "@/lib/venue/menu-display";
import type { MenuItem } from "@/lib/venue/menus";

export function CourseChips({
  value,
  onChange,
}: {
  value: MenuItem["course"];
  onChange: (course: MenuItem["course"]) => void;
}) {
  return (
    <div className="mp-chips" role="radiogroup" aria-label="Категорија">
      {COURSE_ORDER.map((course) => (
        <button
          key={course}
          type="button"
          role="radio"
          aria-checked={value === course}
          onClick={() => onChange(course)}
          className="mp-chip"
        >
          {COURSE_META[course].label}
        </button>
      ))}
    </div>
  );
}
