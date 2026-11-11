// A static starter checklist of commonly-needed wedding expenses, shown
// alongside the couple's own budget so they don't have to remember every
// line item from scratch. Deliberately carries no suggested amount — costs
// vary too much (region, vendor, guest count) for a guessed number to be
// more helpful than misleading; the couple fills that in once they add it.

export interface BudgetSuggestion {
  id: string;
  category: string;
  name: string;
}

export const BUDGET_SUGGESTIONS: BudgetSuggestion[] = [
  { id: "church", category: "other", name: "Црква" },
  { id: "civil-registry", category: "other", name: "Матично" },
  { id: "music", category: "music_entertainment", name: "Музика" },
  { id: "photographer-videographer", category: "photography", name: "Фотограф/видеограф" },
  { id: "cake", category: "catering", name: "Торта" },
  { id: "decor", category: "flowers_decor", name: "Декорација" },
  { id: "wedding-dress", category: "attire", name: "Невестински фустан" },
  { id: "groom-suit", category: "attire", name: "Одело за младоженецот" },
  { id: "makeup", category: "attire", name: "Шминка" },
  { id: "hairstyle", category: "attire", name: "Фризура" },
  { id: "bachelorette-party", category: "other", name: "Моминска/девојачка вечер" },
  { id: "bachelor-party", category: "other", name: "Ергенска вечер" },
  { id: "honeymoon", category: "other", name: "Свадбено патување" },
];
