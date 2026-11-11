import { requireAdmin } from "@/lib/admin/guard";
import { listVendorPartners } from "@/lib/vendor-partners/partners";
import { VendorPartnersClient } from "@/components/admin/VendorPartnersClient";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
  await requireAdmin({ page: true });
  const vendors = await listVendorPartners();
  return (
    <div className="wrap">
      <VendorPartnersClient vendors={vendors} />
    </div>
  );
}
