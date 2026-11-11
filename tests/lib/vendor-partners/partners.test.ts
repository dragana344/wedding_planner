// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listVendorPartners, getVendorPartner } from "@/lib/vendor-partners/partners";
import { getVendorPartnerPhotoUrl } from "@/lib/vendor-partners/photo-url";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

let featuredId: string;
let plainId: string;

describe("vendor-partners data layer", () => {
  beforeAll(async () => {
    const { data: plain } = await admin
      .from("vendor_partners")
      .insert({ category: "music", name: "Б Бенд", city: "Скопје", short_description: "Свадбена музика", is_featured: false })
      .select()
      .single();
    plainId = plain!.id;
    const { data: featured } = await admin
      .from("vendor_partners")
      .insert({ category: "florist", name: "А Цвеќара", city: "Скопје", short_description: "Свадбени букети", is_featured: true })
      .select()
      .single();
    featuredId = featured!.id;
  });

  afterAll(async () => {
    await admin.from("vendor_partners").delete().in("id", [plainId, featuredId]);
  });

  it("lists featured vendors first, regardless of name order", async () => {
    const list = await listVendorPartners();
    const ids = list.map((v) => v.id);
    expect(ids.indexOf(featuredId)).toBeLessThan(ids.indexOf(plainId));
  });

  it("gets a single vendor by id, and null for a missing one", async () => {
    const found = await getVendorPartner(plainId);
    expect(found?.name).toBe("Б Бенд");
    expect(found?.gallery_photo_paths).toEqual([]);
    expect(await getVendorPartner("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("builds a public photo URL, and returns null for no path", () => {
    expect(getVendorPartnerPhotoUrl(null)).toBeNull();
    expect(getVendorPartnerPhotoUrl(`${plainId}/cover-1.jpg`)).toContain("vendor-partner-photos");
  });
});
