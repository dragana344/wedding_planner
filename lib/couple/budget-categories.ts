export interface BudgetCategory {
  id: string;
  label: string;
}

export const BUDGET_CATEGORIES: BudgetCategory[] = [
  { id: "catering", label: "Catering" },
  { id: "photography", label: "Photography" },
  { id: "videography", label: "Videography" },
  { id: "flowers_decor", label: "Flowers & Decor" },
  { id: "music_entertainment", label: "Music & Entertainment" },
  { id: "attire", label: "Attire" },
  { id: "invitations_stationery", label: "Invitations & Stationery" },
  { id: "transportation", label: "Transportation" },
  { id: "other", label: "Other" },
];

export function getBudgetCategoryLabel(id: string): string {
  return BUDGET_CATEGORIES.find((c) => c.id === id)?.label ?? "Other";
}
