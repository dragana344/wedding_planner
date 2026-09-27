export interface BudgetCategory {
  id: string;
  label: string;
}

export const BUDGET_CATEGORIES: BudgetCategory[] = [
  { id: "catering", label: "Кетеринг" },
  { id: "photography", label: "Фотографија" },
  { id: "videography", label: "Видеографија" },
  { id: "flowers_decor", label: "Цвеќиња и декор" },
  { id: "music_entertainment", label: "Музика и забава" },
  { id: "attire", label: "Облека" },
  { id: "invitations_stationery", label: "Покани и канцелариски материјал" },
  { id: "transportation", label: "Превоз" },
  { id: "other", label: "Друго" },
];

export function getBudgetCategoryLabel(id: string): string {
  return BUDGET_CATEGORIES.find((c) => c.id === id)?.label ?? "Друго";
}
