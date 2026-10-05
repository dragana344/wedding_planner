import { requireAdmin } from "@/lib/admin/guard";
import { listPricingCards } from "@/lib/admin/queries";
import { PricingCardsEditor } from "@/components/admin/PricingCardsEditor";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  await requireAdmin({ page: true });
  const cards = await listPricingCards();
  return (
    <div className="wrap">
      <PricingCardsEditor cards={cards} />
    </div>
  );
}
