import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Price cards on the landing page. The admin edits them in Ценовник
// (app/admin/(panel)/pricing); the table is `pricing_cards` (0085).

export type PricingCard = {
  id: string;
  name: string;
  price: string;
  period: string | null;
  features: string[];
  featured: boolean;
};

// Shown when the table can't be read (database down, or a deploy that lands
// before 0085 is applied) so the landing page never loses its price section.
// Same three cards 0085 seeds.
export const DEFAULT_PRICING: PricingCard[] = [
  {
    id: "default-basic",
    name: "Основен",
    price: "1.500 ден",
    period: "/ месечно",
    features: ["1 локал", "До 2 простории", "Управување со настани", "Резервации", "Распоред на маси"],
    featured: false,
  },
  {
    id: "default-pro",
    name: "Про",
    price: "3.500 ден",
    period: "/ месечно",
    features: ["Сè од Основен", "Менија и пакети", "Буџет и чеклиста за парови", "Дигитални покани со QR код", "Известувања (наскоро)"],
    featured: true,
  },
  {
    id: "default-premium",
    name: "Премиум",
    price: "По договор",
    period: null,
    features: ["Сè од Про", "Брендирање по мерка на локалот", "Извештаи и аналитика", "Приоритетна поддршка"],
    featured: false,
  },
];

const FETCH_TIMEOUT_MS = 2_000;

type PricingCardDb = { id: string; name: string; price: string; period: string | null; features: string[]; is_featured: boolean };

/**
 * Published cards in display order. An empty list is a valid answer (the
 * admin unpublished everything → the landing page hides the section); only a
 * failed read falls back to DEFAULT_PRICING.
 */
export async function getPricingCards(): Promise<PricingCard[]> {
  try {
    const { data, error } = await createServiceRoleClient()
      .from("pricing_cards")
      .select("id, name, price, period, features, is_featured")
      .eq("is_published", true)
      .order("sort_order")
      .order("created_at")
      .abortSignal(AbortSignal.timeout(FETCH_TIMEOUT_MS));
    if (error) throw error;
    return ((data ?? []) as PricingCardDb[]).map((c) => ({
      id: c.id,
      name: c.name,
      price: c.price,
      period: c.period,
      features: c.features,
      featured: c.is_featured,
    }));
  } catch {
    return DEFAULT_PRICING;
  }
}
