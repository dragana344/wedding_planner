"use client";

import { Icon } from "@/components/venue/shell/Icon";

export function DietToggles({
  isVegetarian,
  onVegetarianChange,
  isVegan,
  onVeganChange,
}: {
  isVegetarian: boolean;
  onVegetarianChange: (value: boolean) => void;
  isVegan: boolean;
  onVeganChange: (value: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <button
        type="button"
        className={`mp-diet-toggle${isVegetarian ? " on" : ""}`}
        aria-pressed={isVegetarian}
        onClick={() => onVegetarianChange(!isVegetarian)}
      >
        <Icon name="leaf" size="sm" /> Вегетаријанско
      </button>
      <button
        type="button"
        className={`mp-diet-toggle${isVegan ? " on" : ""}`}
        aria-pressed={isVegan}
        onClick={() => onVeganChange(!isVegan)}
      >
        <Icon name="sprout" size="sm" /> Веганско
      </button>
    </div>
  );
}
