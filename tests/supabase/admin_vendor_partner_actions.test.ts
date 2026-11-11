import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { vendorPartnerActionCore as core } from "@/lib/admin/vendor-partners-actions-core";

// Admin-curated vendor/partner directory (0142), through vendorPartnerActionCore
// directly — same pattern as tests/supabase/admin_pricing_actions.test.ts.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
const ctx = { adminUserId: "00000000-0000-4000-8000-00000000ad06", requestId: null };
const createdIds: string[] = [];

const baseInput = {
  category: "catering" as const,
  name: "Кетеринг Тест",
  city: "Битола",
  shortDescription: "Кетеринг за секаков настан",
  fullDescription: null,
  phone: null,
  viberPhone: null,
  whatsappPhone: null,
  websiteUrl: null,
  instagramUrl: null,
  facebookUrl: null,
  isFeatured: false,
};

afterAll(async () => {
  if (createdIds.length) await admin.from("vendor_partners").delete().in("id", createdIds);
});

describe("vendor-partners admin actions (0142)", () => {
  it("creates, updates, and deletes a vendor", async () => {
    const created = await core.create(baseInput, ctx);
    createdIds.push(created.data.id);
    expect(created.audit?.action).toBe("admin_vendor_partner_created");

    const updated = await core.update({ ...baseInput, vendorId: created.data.id, name: "Кетеринг Тест 2" }, ctx);
    expect(updated.audit?.action).toBe("admin_vendor_partner_updated");
    const { data: row } = await admin.from("vendor_partners").select("name").eq("id", created.data.id).single();
    expect(row!.name).toBe("Кетеринг Тест 2");

    await core.remove({ vendorId: created.data.id }, ctx);
    const { data: gone } = await admin.from("vendor_partners").select("id").eq("id", created.data.id);
    expect(gone).toEqual([]);
    await expect(core.remove({ vendorId: created.data.id }, ctx)).rejects.toThrow("Соработникот не постои.");
  });

  it("removes every photo from storage when a vendor is deleted", async () => {
    const created = await core.create(baseInput, ctx);
    const vendorId = created.data.id as string;
    const file = new File([new Uint8Array([1, 2, 3])], "cover.jpg", { type: "image/jpeg" });
    await core.uploadPhoto({ vendorId, purpose: "cover", file }, ctx);

    await core.remove({ vendorId }, ctx);

    const { data: exists } = await admin.storage.from("vendor-partner-photos").list(vendorId);
    expect(exists ?? []).toHaveLength(0);
  });

  it("appends a gallery photo without disturbing earlier ones, and removes one by path", async () => {
    const created = await core.create(baseInput, ctx);
    createdIds.push(created.data.id);
    const vendorId = created.data.id as string;
    const file1 = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    const file2 = new File([new Uint8Array([2])], "b.jpg", { type: "image/jpeg" });
    const first = await core.uploadPhoto({ vendorId, purpose: "gallery", file: file1 }, ctx);
    const second = await core.uploadPhoto({ vendorId, purpose: "gallery", file: file2 }, ctx);

    const { data: afterTwo } = await admin.from("vendor_partners").select("gallery_photo_paths").eq("id", vendorId).single();
    expect(afterTwo!.gallery_photo_paths).toEqual([first.data.path, second.data.path]);

    await core.removeGalleryPhoto({ vendorId, path: first.data.path as string }, ctx);
    const { data: afterRemove } = await admin.from("vendor_partners").select("gallery_photo_paths").eq("id", vendorId).single();
    expect(afterRemove!.gallery_photo_paths).toEqual([second.data.path]);
  });

  it("is unreadable with the public anon key", async () => {
    const { data } = await anon.from("vendor_partners").select("id");
    expect(data ?? []).toEqual([]);
  });
});
