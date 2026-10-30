import type { MenuItem } from "@/lib/venue/menus";

/** Course display metadata, in the order they're grouped/shown throughout the Мени/Пакети page. */
export const COURSE_ORDER: MenuItem["course"][] = ["starter", "main", "dessert", "other"];

export const COURSE_META: Record<MenuItem["course"], { label: string; icon: string }> = {
  starter: { label: "Предјадење", icon: "salad" },
  main: { label: "Главно јадење", icon: "meat" },
  dessert: { label: "Десерт", icon: "cake" },
  other: { label: "Друго", icon: "menu" },
};

export function formatPrice(price: number): string {
  return `${Math.round(price).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ден`;
}

/** The dish-list filter chips: every course, plus "all" and "посно" (fasting-friendly —
 * treated as equivalent to is_vegan, with no separate database field). */
export type DishFilter = MenuItem["course"] | "all" | "posno";

export function filterDishes<T extends Pick<MenuItem, "course" | "is_vegan">>(items: T[], filter: DishFilter): T[] {
  if (filter === "all") return items;
  if (filter === "posno") return items.filter((item) => item.is_vegan);
  return items.filter((item) => item.course === filter);
}

/** The EU's major allergens, offered as one-click adds in the allergen tag editor. */
export const COMMON_ALLERGENS = ["Глутен", "Млеко", "Јајца", "Јаткасти плодови", "Риба", "Соја", "Сусам", "Целер"];
