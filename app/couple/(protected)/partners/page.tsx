import { listVendorPartners } from "@/lib/vendor-partners/partners";
import { VENDOR_PARTNER_CATEGORIES, type VendorPartnerCategory } from "@/lib/vendor-partners/categories";
import { PartnerDirectory } from "@/components/vendor-partners/PartnerDirectory";
import { SparkleIcon } from "@/components/vendor-partners/art";

export const dynamic = "force-dynamic";

function isVendorPartnerCategory(value: string | undefined): value is VendorPartnerCategory {
  return VENDOR_PARTNER_CATEGORIES.includes(value as VendorPartnerCategory);
}

export default async function CouplePartnersPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const vendors = await listVendorPartners();
  const { category } = await searchParams;
  const initialCategory = isVendorPartnerCategory(category) ? category : "";
  return (
    <div className="wrap">
      <section className="panel pv-page">
        <header className="pv-head">
          <div>
            <p className="pv-eyebrow">
              <SparkleIcon className="pv-eyebrow-star" />
              Откријте повеќе за вашиот настан
            </p>
            <h2 className="pv-title">Услуги за вашиот настан</h2>
            <p className="pv-sub">Вистинските професионалци за вашиот посебен ден.</p>
          </div>
          <SparkleIcon outline className="pv-head-star" />
        </header>
        <PartnerDirectory partners={vendors} initialCategory={initialCategory} />
      </section>
    </div>
  );
}
