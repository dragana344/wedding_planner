import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { VENDOR_PARTNER_CATEGORIES } from "@/lib/vendor-partners/categories";

const db = () => createServiceRoleClient();
const revalidatePathSafe = (p: string) => {
  try {
    revalidatePath(p);
  } catch {
    /* outside a request (tests) */
  }
};
const revalidateAll = () => {
  revalidatePathSafe("/admin/vendors");
  revalidatePathSafe("/couple/partners");
  revalidatePathSafe("/");
};

const NOT_FOUND = "Соработникот не постои.";
const BUCKET = "vendor-partner-photos";

const vendor = {
  category: z.enum(VENDOR_PARTNER_CATEGORIES),
  name: z.string().trim().min(1, "Внесете име.").max(100, "Името е предолго."),
  city: z.string().trim().min(1, "Внесете град.").max(60, "Градот е предолг."),
  shortDescription: z.string().trim().min(1, "Внесете краток опис.").max(200, "Описот е предолг."),
  fullDescription: z
    .string()
    .trim()
    .max(2000, "Описот е предолг.")
    .nullable()
    .transform((v) => v || null),
  phone: z
    .string()
    .trim()
    .max(40, "Бројот е предолг.")
    .nullable()
    .transform((v) => v || null),
  viberPhone: z
    .string()
    .trim()
    .max(40, "Бројот е предолг.")
    .nullable()
    .transform((v) => v || null),
  whatsappPhone: z
    .string()
    .trim()
    .max(40, "Бројот е предолг.")
    .nullable()
    .transform((v) => v || null),
  websiteUrl: z
    .string()
    .trim()
    .max(300, "Линкот е предолг.")
    .nullable()
    .transform((v) => v || null),
  instagramUrl: z
    .string()
    .trim()
    .max(300, "Линкот е предолг.")
    .nullable()
    .transform((v) => v || null),
  facebookUrl: z
    .string()
    .trim()
    .max(300, "Линкот е предолг.")
    .nullable()
    .transform((v) => v || null),
  isFeatured: z.boolean(),
};

export const vendorPartnerSchemas = {
  create: z.object(vendor),
  update: z.object({ vendorId: z.string().uuid(), ...vendor }),
  id: z.object({ vendorId: z.string().uuid() }),
  uploadPhoto: z.object({
    vendorId: z.string().uuid(),
    purpose: z.enum(["cover", "gallery"]),
    file: z.instanceof(File),
  }),
  removeGalleryPhoto: z.object({ vendorId: z.string().uuid(), path: z.string().min(1) }),
};

type VendorInput = z.infer<typeof vendorPartnerSchemas.create>;

const toRow = (i: VendorInput) => ({
  category: i.category,
  name: i.name,
  city: i.city,
  short_description: i.shortDescription,
  full_description: i.fullDescription,
  phone: i.phone,
  viber_phone: i.viberPhone,
  whatsapp_phone: i.whatsappPhone,
  website_url: i.websiteUrl,
  instagram_url: i.instagramUrl,
  facebook_url: i.facebookUrl,
  is_featured: i.isFeatured,
});

export const vendorPartnerActionCore = {
  // ctx is part of the shape adminAction calls every core function with.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async create(i: VendorInput, _ctx: AdminContext) {
    const { data, error } = await db().from("vendor_partners").insert(toRow(i)).select("id").single();
    if (error) throw error;
    const vendorId = data.id as string;
    revalidateAll();
    return { data: { id: vendorId }, audit: { action: "admin_vendor_partner_created", targetId: vendorId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async update(i: z.infer<typeof vendorPartnerSchemas.update>, _ctx: AdminContext) {
    const { data, error } = await db()
      .from("vendor_partners")
      .update({ ...toRow(i), updated_at: new Date().toISOString() })
      .eq("id", i.vendorId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(NOT_FOUND);
    revalidateAll();
    return { data: null, audit: { action: "admin_vendor_partner_updated", targetId: i.vendorId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async remove(i: z.infer<typeof vendorPartnerSchemas.id>, _ctx: AdminContext) {
    const { data: row, error: readErr } = await db()
      .from("vendor_partners")
      .select("cover_photo_path, gallery_photo_paths")
      .eq("id", i.vendorId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!row) throw new Error(NOT_FOUND);
    const paths = [row.cover_photo_path, ...row.gallery_photo_paths].filter((p): p is string => !!p);
    if (paths.length > 0) await db().storage.from(BUCKET).remove(paths);
    const { data, error } = await db().from("vendor_partners").delete().eq("id", i.vendorId).select("id");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(NOT_FOUND);
    revalidateAll();
    return { data: null, audit: { action: "admin_vendor_partner_deleted", targetId: i.vendorId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async uploadPhoto(i: z.infer<typeof vendorPartnerSchemas.uploadPhoto>, _ctx: AdminContext) {
    const extension = i.file.name.split(".").pop() ?? "jpg";
    const path = `${i.vendorId}/${i.purpose}-${Date.now()}.${extension}`;
    const { error: uploadError } = await db()
      .storage.from(BUCKET)
      .upload(path, i.file, { upsert: true, cacheControl: "31536000" });
    if (uploadError) throw uploadError;
    if (i.purpose === "cover") {
      const { error } = await db().from("vendor_partners").update({ cover_photo_path: path }).eq("id", i.vendorId);
      if (error) throw error;
    } else {
      const { data: row, error: readErr } = await db()
        .from("vendor_partners")
        .select("gallery_photo_paths")
        .eq("id", i.vendorId)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!row) throw new Error(NOT_FOUND);
      const nextPaths = [...row.gallery_photo_paths, path];
      const { error } = await db().from("vendor_partners").update({ gallery_photo_paths: nextPaths }).eq("id", i.vendorId);
      if (error) throw error;
    }
    revalidateAll();
    return { data: { path }, audit: { action: "admin_vendor_partner_photo_uploaded", targetId: i.vendorId } };
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async removeGalleryPhoto(i: z.infer<typeof vendorPartnerSchemas.removeGalleryPhoto>, _ctx: AdminContext) {
    const { data: row, error: readErr } = await db()
      .from("vendor_partners")
      .select("gallery_photo_paths")
      .eq("id", i.vendorId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!row) throw new Error(NOT_FOUND);
    await db().storage.from(BUCKET).remove([i.path]);
    const nextPaths = row.gallery_photo_paths.filter((p: string) => p !== i.path);
    const { error } = await db().from("vendor_partners").update({ gallery_photo_paths: nextPaths }).eq("id", i.vendorId);
    if (error) throw error;
    revalidateAll();
    return { data: null, audit: { action: "admin_vendor_partner_photo_removed", targetId: i.vendorId } };
  },
};
