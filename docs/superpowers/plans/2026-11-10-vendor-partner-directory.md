# Vendor/Partner Directory Implementation Plan

**Goal:** Ship an admin-curated directory of wedding/event vendors (bands, decoration, catering, florists, jewelers, equipment, photography, cakes/desserts, makeup & hair), shown as a public landing-page section and a full couple-dashboard section, both reading the exact same data through shared components — with zero vendor accounts, booking, or payment logic.

**Architecture:** One new table (`vendor_partners`) with no client-side RLS access at all — every read and write goes through server-side code using the service-role client, matching the existing `pricing_cards` (0085) convention. Admin writes follow the existing `adminAction` (zod schema + core function + audit) pattern used by every other admin mutation. Three shared UI components (`PartnerCard`, `PartnerDetailModal`, `PartnerDirectory`) are consumed unmodified by the admin screen, the couple-dashboard page, and the public landing-page section — one listing system, three call sites.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Storage, service-role access), Zod, Vitest (`vitest.config.ts` unit / `vitest.db.config.ts` DB), existing `Modal`/`ImageLightbox` components.

**Spec:** `docs/superpowers/specs/2026-11-10-vendor-partner-directory-design.md` (approved by user 2026-11-10)

## Global Constraints

- No vendor accounts, login, self-serve editing, submission/approval queue, booking, or payment logic anywhere in this feature (spec §2).
- Every mutation lives behind the `adminAction` wrapper (`lib/admin/actions.ts`) in `app/admin/(panel)/vendors/actions.ts` — `tests/security/admin-static.test.ts` greps every file under `app/admin/**` and fails if any exported function there is not wrapped in `adminAction`.
- `vendor_partners` has **no** RLS select/insert/update/delete policy for `anon`/`authenticated` — `revoke all ... from anon, authenticated; grant all ... to service_role;`, exactly like `pricing_cards` (migration `0085_pricing_cards.sql`). Every read goes through `createServiceRoleClient()` inside `lib/vendor-partners/partners.ts`, never a direct client-side Supabase query.
- The vendor detail view is a **modal** (`components/venue/dashboard/Modal.tsx` + `components/venue/dashboard/ImageLightbox.tsx` for the gallery), never a separate route/page — this was an explicit correction from the user mid-design.
- The landing page, the couple-dashboard page, and the admin screen all call the same `listVendorPartners()` and render the same `PartnerCard`/`PartnerDirectory`/`PartnerDetailModal` components — no second copy of the listing/filtering logic.
- All UI copy is in Macedonian, matching the existing short-label tone used elsewhere in the dashboards.
- Migration file is `supabase/migrations/0142_vendor_partners.sql` (next free number after `0141_event_wizard_room_layouts.sql`).
- Any new table must be added to `tests/supabase/rls_guard.test.ts`'s `SERVICE_ROLE_ONLY_TABLES` and every new column to `tests/supabase/privacy-classification.ts`'s `COLUMN_CLASSIFICATION` — discovered via a full `npm run test:db` run after Task 7; both guard tests fail loudly on an unclassified table/column, so this is enforced, not optional. `vendor_partners` classifies as `N` ("none") throughout, same as `pricing_cards`: no account or erasure path is ever tied to it.

## Review Focus

- **Empty directory (zero vendors seeded yet):** the landing-page section and the couple-dashboard page must render a graceful empty state, not crash or show a broken grid. Covered in Task 4/6/7's tests.
- **Deleting a vendor with photos:** the cover photo and every gallery photo must actually be removed from storage (`storage.remove(...)`), not leave orphaned files; reading a just-deleted vendor's id returns `null`, not an error. Covered in Task 3.
- **A vendor with every contact field left blank:** the card and the detail modal must render with no contact buttons at all, not a row of empty/broken links. Covered in Task 4.
- **Category + city + name-search combined to match nothing:** `PartnerDirectory` must show an explicit "нема резултати" message, not a silently empty grid. Covered in Task 4.
- **Featured ordering is visible, not just stored:** toggling a vendor's `is_featured` flag must move it to the front of `listVendorPartners()`'s result, since that's the only thing standing in for a "premium" distinction in this version. Covered in Task 2.

---

### Task 1: Migration — table and storage bucket

**Files:**
- Create: `supabase/migrations/0142_vendor_partners.sql`

**Interfaces:**
- Produces: table `public.vendor_partners` with columns exactly as below; storage bucket `vendor-partner-photos` (public, service-role-only writes). Every later task's code depends on these exact column names.

- [ ] **Step 1: Write the migration**

```sql
-- 0142: admin-curated vendor/partner directory (bands, decoration, catering,
-- florists, jewelers, equipment, photography, cakes/desserts, makeup & hair).
-- No vendor accounts: every row is created/edited by platform admin staff.
-- Shown publicly on the landing page and inside the couple dashboard — same
-- data, no RLS read policy needed, exactly like pricing_cards (0085): every
-- read goes through the service-role client in lib/vendor-partners/partners.ts.

begin;

create table public.vendor_partners (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'music', 'decoration', 'catering', 'florist', 'jeweler',
    'equipment', 'photography', 'cakes_desserts', 'makeup_hair'
  )),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  city text not null check (char_length(btrim(city)) between 1 and 60),
  short_description text not null check (char_length(btrim(short_description)) between 1 and 200),
  full_description text check (full_description is null or char_length(full_description) <= 2000),
  cover_photo_path text,
  gallery_photo_paths text[] not null default '{}' check (cardinality(gallery_photo_paths) <= 12),
  phone text,
  viber_phone text,
  whatsapp_phone text,
  website_url text,
  instagram_url text,
  facebook_url text,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_partners enable row level security;
revoke all on public.vendor_partners from anon, authenticated;
grant all on public.vendor_partners to service_role;

insert into storage.buckets (id, name, public) values ('vendor-partner-photos', 'vendor-partner-photos', true);

create policy "vendor_partner_photos_public_read" on storage.objects
  for select using (bucket_id = 'vendor-partner-photos');

commit;
```

- [ ] **Step 2: Apply it locally and verify**

Run: `npx supabase migration up --local`
Expected: migration `0142_vendor_partners` applies with no error.

Then run: `npx supabase db execute --local --sql "select column_name from information_schema.columns where table_name = 'vendor_partners' order by ordinal_position;"` (or equivalent via the Supabase Studio/psql) and confirm all 16 columns listed above are present.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0142_vendor_partners.sql
git commit -m "feat: add vendor_partners table and storage bucket"
```

---

### Task 2: Public data layer

**Files:**
- Create: `lib/vendor-partners/partners.ts`
- Test: `tests/lib/vendor-partners/partners.test.ts`

**Interfaces:**
- Consumes: Task 1's `vendor_partners` table and `vendor-partner-photos` bucket.
- Produces: `VendorPartner` type, `VendorPartnerCategory` type, `listVendorPartners(): Promise<VendorPartner[]>`, `getVendorPartner(id: string): Promise<VendorPartner | null>`, `getVendorPartnerPhotoUrl(path: string | null): string | null`. Every later task (admin, couple dashboard, landing page) imports these exact names from this file — this is the single source of truth the spec's "no duplicate listing system" constraint depends on.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/vendor-partners/partners.test.ts
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { listVendorPartners, getVendorPartner, getVendorPartnerPhotoUrl } from "@/lib/vendor-partners/partners";

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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- tests/lib/vendor-partners/partners.test.ts`
Expected: FAIL — `Cannot find module '@/lib/vendor-partners/partners'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/vendor-partners/partners.ts
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type VendorPartnerCategory =
  | "music"
  | "decoration"
  | "catering"
  | "florist"
  | "jeweler"
  | "equipment"
  | "photography"
  | "cakes_desserts"
  | "makeup_hair";

export interface VendorPartner {
  id: string;
  category: VendorPartnerCategory;
  name: string;
  city: string;
  short_description: string;
  full_description: string | null;
  cover_photo_path: string | null;
  gallery_photo_paths: string[];
  phone: string | null;
  viber_phone: string | null;
  whatsapp_phone: string | null;
  website_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  is_featured: boolean;
}

const VENDOR_PARTNER_COLUMNS =
  "id, category, name, city, short_description, full_description, cover_photo_path, gallery_photo_paths, phone, viber_phone, whatsapp_phone, website_url, instagram_url, facebook_url, is_featured";

const VENDOR_PARTNER_PHOTOS_BUCKET = "vendor-partner-photos";

export function getVendorPartnerPhotoUrl(path: string | null): string | null {
  if (!path) return null;
  const { data } = createServiceRoleClient().storage.from(VENDOR_PARTNER_PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Every read for the landing page, the couple dashboard, and the admin
 * screen goes through this one function — there is no second listing path. */
export async function listVendorPartners(): Promise<VendorPartner[]> {
  const { data, error } = await createServiceRoleClient()
    .from("vendor_partners")
    .select(VENDOR_PARTNER_COLUMNS)
    .order("is_featured", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []) as VendorPartner[];
}

export async function getVendorPartner(id: string): Promise<VendorPartner | null> {
  const { data, error } = await createServiceRoleClient()
    .from("vendor_partners")
    .select(VENDOR_PARTNER_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as VendorPartner | null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db -- tests/lib/vendor-partners/partners.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add lib/vendor-partners/partners.ts tests/lib/vendor-partners/partners.test.ts
git commit -m "feat: add vendor-partners public data layer"
```

---

### Task 3: Admin write layer

**Files:**
- Create: `lib/admin/vendor-partners-actions-core.ts`
- Create: `app/admin/(panel)/vendors/actions.ts`
- Test: `tests/supabase/admin_vendor_partner_actions.test.ts` (DB-touching admin-core tests live under `tests/supabase/**`, not `tests/lib/admin/**` — the latter is excluded from `vitest.db.config.ts`, confirmed against the existing `tests/supabase/admin_pricing_actions.test.ts`)

**Interfaces:**
- Consumes: Task 2's `VendorPartnerCategory`; `lib/admin/actions.ts`'s `adminAction`; `lib/admin/guard.ts`'s `AdminContext`.
- Produces: `VENDOR_PARTNER_CATEGORIES` (readonly tuple), `vendorPartnerSchemas` (`create`, `update`, `id`, `uploadPhoto`, `removeGalleryPhoto`), `vendorPartnerActionCore` (`create`, `update`, `remove`, `uploadPhoto`, `removeGalleryPhoto`) — Task 5's admin UI calls the wrapped versions exported from `app/admin/(panel)/vendors/actions.ts` (`createVendorPartner`, `updateVendorPartner`, `deleteVendorPartner`, `uploadVendorPartnerPhoto`, `removeVendorPartnerGalleryPhoto`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/admin/vendor-partners-actions-core.test.ts
// @vitest-environment node
import { describe, it, expect, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { vendorPartnerActionCore as core } from "@/lib/admin/vendor-partners-actions-core";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const ctx = { adminUserId: "test-admin", requestId: "test-request" } as never;

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

let createdIds: string[] = [];

describe("vendor-partners admin actions core", () => {
  afterAll(async () => {
    if (createdIds.length) await admin.from("vendor_partners").delete().in("id", createdIds);
  });

  it("creates, updates, and deletes a vendor", async () => {
    const created = await core.create(baseInput, ctx);
    createdIds.push(created.data.id);
    expect(created.audit?.action).toBe("admin_vendor_partner_created");

    const updated = await core.update({ ...baseInput, vendorId: created.data.id, name: "Кетеринг Тест 2" }, ctx);
    expect(updated.audit?.action).toBe("admin_vendor_partner_updated");
    const { data: row } = await admin.from("vendor_partners").select("name").eq("id", created.data.id).single();
    expect(row!.name).toBe("Кетеринг Тест 2");

    await core.remove({ vendorId: created.data.id }, ctx);
    const { data: gone } = await admin.from("vendor_partners").select("id").eq("id", created.data.id).maybeSingle();
    expect(gone).toBeNull();
    createdIds = createdIds.filter((id) => id !== created.data.id);
  });

  it("removes every photo from storage when a vendor is deleted", async () => {
    const created = await core.create(baseInput, ctx);
    const vendorId = created.data.id as string;
    const file = new File([new Uint8Array([1, 2, 3])], "cover.jpg", { type: "image/jpeg" });
    const uploaded = await core.uploadPhoto({ vendorId, purpose: "cover", file }, ctx);
    const path = uploaded.data.path as string;

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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:db -- tests/lib/admin/vendor-partners-actions-core.test.ts`
Expected: FAIL — `Cannot find module '@/lib/admin/vendor-partners-actions-core'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/admin/vendor-partners-actions-core.ts
import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { AdminContext } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

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

export const VENDOR_PARTNER_CATEGORIES = [
  "music",
  "decoration",
  "catering",
  "florist",
  "jeweler",
  "equipment",
  "photography",
  "cakes_desserts",
  "makeup_hair",
] as const;

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
```

```ts
// app/admin/(panel)/vendors/actions.ts
"use server";

// Thin Server Action wrappers, same shape as ../pricing/actions.ts: every
// export must be `adminAction(...)` (tests/security/admin-static.test.ts).

import { adminAction } from "@/lib/admin/actions";
import { vendorPartnerActionCore as core, vendorPartnerSchemas as schemas } from "@/lib/admin/vendor-partners-actions-core";

export const createVendorPartner = adminAction(schemas.create, core.create);
export const updateVendorPartner = adminAction(schemas.update, core.update);
export const deleteVendorPartner = adminAction(schemas.id, core.remove);
export const uploadVendorPartnerPhoto = adminAction(schemas.uploadPhoto, core.uploadPhoto);
export const removeVendorPartnerGalleryPhoto = adminAction(schemas.removeGalleryPhoto, core.removeGalleryPhoto);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:db -- tests/lib/admin/vendor-partners-actions-core.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Run the admin boundary static test**

Run: `npm run test:unit -- tests/security/admin-static.test.ts`
Expected: PASS — confirms every export in the new `actions.ts` is wrapped in `adminAction`.

- [ ] **Step 6: Commit**

```bash
git add lib/admin/vendor-partners-actions-core.ts "app/admin/(panel)/vendors/actions.ts" tests/lib/admin/vendor-partners-actions-core.test.ts
git commit -m "feat: add vendor-partners admin write layer"
```

---

### Task 4: Shared UI components

**Files:**
- Create: `components/vendor-partners/PartnerCard.tsx`
- Create: `components/vendor-partners/PartnerDetailModal.tsx`
- Create: `components/vendor-partners/PartnerDirectory.tsx`
- Create: `components/vendor-partners/partner-directory.css`
- Test: `tests/components/vendor-partners/PartnerCard.test.tsx`
- Test: `tests/components/vendor-partners/PartnerDirectory.test.tsx`

**Interfaces:**
- Consumes: Task 2's `VendorPartner`, `VendorPartnerCategory`, `getVendorPartnerPhotoUrl`; `components/venue/dashboard/Modal.tsx`; `components/venue/dashboard/ImageLightbox.tsx`.
- Produces: `CATEGORY_LABELS: Record<VendorPartnerCategory, string>` (exported from `PartnerCard.tsx`, reused by the admin form in Task 5), `PartnerCard`, `PartnerDetailModal`, `PartnerDirectory` — Tasks 5, 6, and 7 render `PartnerDirectory` directly and pass it nothing but the full `VendorPartner[]` list; it owns its own filtering/search state internally.

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/components/vendor-partners/PartnerCard.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartnerCard } from "@/components/vendor-partners/PartnerCard";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

const base: VendorPartner = {
  id: "v1",
  category: "music",
  name: "Бенд Весели Моменти",
  city: "Скопје",
  short_description: "Свадбена музика",
  full_description: null,
  cover_photo_path: null,
  gallery_photo_paths: [],
  phone: null,
  viber_phone: null,
  whatsapp_phone: null,
  website_url: null,
  instagram_url: null,
  facebook_url: null,
  is_featured: false,
};

describe("PartnerCard", () => {
  it("renders no contact buttons when every contact field is empty", () => {
    render(<PartnerCard partner={base} onOpen={vi.fn()} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a contact button only for the fields that are filled in", () => {
    render(<PartnerCard partner={{ ...base, phone: "070123456", website_url: "https://example.mk" }} onOpen={vi.fn()} />);
    expect(screen.getByRole("link", { name: /070123456/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /example\.mk|Веб-страница/i })).toBeInTheDocument();
  });

  it("calls onOpen with the partner when clicked", async () => {
    const onOpen = vi.fn();
    render(<PartnerCard partner={base} onOpen={onOpen} />);
    await userEvent.click(screen.getByRole("button", { name: /Погледни повеќе/i }));
    expect(onOpen).toHaveBeenCalledWith(base);
  });

  it("shows a featured badge only when is_featured is true", () => {
    const { rerender } = render(<PartnerCard partner={base} onOpen={vi.fn()} />);
    expect(screen.queryByText("Издвоено")).not.toBeInTheDocument();
    rerender(<PartnerCard partner={{ ...base, is_featured: true }} onOpen={vi.fn()} />);
    expect(screen.getByText("Издвоено")).toBeInTheDocument();
  });
});
```

```tsx
// tests/components/vendor-partners/PartnerDirectory.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PartnerDirectory } from "@/components/vendor-partners/PartnerDirectory";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

function make(overrides: Partial<VendorPartner>): VendorPartner {
  return {
    id: overrides.id ?? "id",
    category: "music",
    name: "Name",
    city: "Скопје",
    short_description: "Опис",
    full_description: null,
    cover_photo_path: null,
    gallery_photo_paths: [],
    phone: null,
    viber_phone: null,
    whatsapp_phone: null,
    website_url: null,
    instagram_url: null,
    facebook_url: null,
    is_featured: false,
    ...overrides,
  };
}

const partners: VendorPartner[] = [
  make({ id: "1", name: "Алфа Бенд", category: "music", city: "Скопје" }),
  make({ id: "2", name: "Бета Цвеќара", category: "florist", city: "Битола" }),
];

describe("PartnerDirectory", () => {
  it("shows an empty-state message when there are no vendors at all", () => {
    render(<PartnerDirectory partners={[]} />);
    expect(screen.getByText(/Нема соработници/i)).toBeInTheDocument();
  });

  it("filters by category", async () => {
    render(<PartnerDirectory partners={partners} />);
    await userEvent.selectOptions(screen.getByLabelText(/Категорија/i), "florist");
    expect(screen.queryByText("Алфа Бенд")).not.toBeInTheDocument();
    expect(screen.getByText("Бета Цвеќара")).toBeInTheDocument();
  });

  it("filters by city", async () => {
    render(<PartnerDirectory partners={partners} />);
    await userEvent.selectOptions(screen.getByLabelText(/Град/i), "Битола");
    expect(screen.queryByText("Алфа Бенд")).not.toBeInTheDocument();
  });

  it("filters by name search", async () => {
    render(<PartnerDirectory partners={partners} />);
    await userEvent.type(screen.getByLabelText(/Пребарај/i), "алфа");
    expect(screen.getByText("Алфа Бенд")).toBeInTheDocument();
    expect(screen.queryByText("Бета Цвеќара")).not.toBeInTheDocument();
  });

  it("shows a no-results message when the filters match nothing", async () => {
    render(<PartnerDirectory partners={partners} />);
    await userEvent.type(screen.getByLabelText(/Пребарај/i), "непостоечко");
    expect(screen.getByText(/Нема резултати/i)).toBeInTheDocument();
  });

  it("opens the detail modal when a card is clicked", async () => {
    render(<PartnerDirectory partners={partners} />);
    await userEvent.click(screen.getAllByRole("button", { name: /Погледни повеќе/i })[0]);
    // level: 2 scopes to the modal's own heading — the card behind it renders
    // an h3 with the same accessible name, which would otherwise match too.
    expect(screen.getByRole("heading", { level: 2, name: "Алфа Бенд" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npm run test:unit -- tests/components/vendor-partners`
Expected: FAIL — the component modules don't exist yet.

- [ ] **Step 3: Write the implementation**

```tsx
// components/vendor-partners/PartnerCard.tsx
"use client";

import { Icon } from "@/components/venue/shell/Icon";
import { internationalPhone } from "@/lib/couple/invite-share";
import { getVendorPartnerPhotoUrl, type VendorPartner, type VendorPartnerCategory } from "@/lib/vendor-partners/partners";

export const CATEGORY_LABELS: Record<VendorPartnerCategory, string> = {
  music: "Музички групи",
  decoration: "Декорација",
  catering: "Кетеринг",
  florist: "Цвеќари",
  jeweler: "Златари",
  equipment: "Опрема и уредување",
  photography: "Фотографи",
  cakes_desserts: "Торти и десерти",
  makeup_hair: "Шминка и фризура",
};

export function PartnerCard({ partner, onOpen }: { partner: VendorPartner; onOpen: (partner: VendorPartner) => void }) {
  const coverUrl = getVendorPartnerPhotoUrl(partner.cover_photo_path);
  const whatsappIntl = internationalPhone(partner.whatsapp_phone);

  return (
    <div className="pv-card">
      {partner.is_featured ? <span className="pv-card-badge">Издвоено</span> : null}
      <div className="pv-card-cover">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a small, variably-sized cover photo from Supabase Storage.
          <img src={coverUrl} alt={partner.name} />
        ) : (
          <Icon name="case" size="lg" />
        )}
      </div>
      <div className="pv-card-body">
        <span className="pv-card-category">{CATEGORY_LABELS[partner.category]}</span>
        <h3 className="pv-card-name">{partner.name}</h3>
        <span className="pv-card-city">{partner.city}</span>
        <p className="pv-card-desc">{partner.short_description}</p>
        <div className="pv-card-contacts">
          {partner.phone ? (
            <a className="btn btn-ghost" href={`tel:${partner.phone}`}>
              <Icon name="call" size="sm" /> {partner.phone}
            </a>
          ) : null}
          {whatsappIntl ? (
            <a className="btn btn-ghost" href={`https://wa.me/${whatsappIntl}`} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
          ) : null}
          {viberIntl ? (
            <a className="btn btn-ghost" href="viber://forward" target="_blank" rel="noopener noreferrer">
              Viber
            </a>
          ) : null}
          {partner.website_url ? (
            <a className="btn btn-ghost" href={partner.website_url} target="_blank" rel="noopener noreferrer">
              Веб-страница
            </a>
          ) : null}
          {partner.instagram_url ? (
            <a className="btn btn-ghost" href={partner.instagram_url} target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
          ) : null}
          {partner.facebook_url ? (
            <a className="btn btn-ghost" href={partner.facebook_url} target="_blank" rel="noopener noreferrer">
              Facebook
            </a>
          ) : null}
        </div>
        <button type="button" className="btn btn-primary pv-card-open" onClick={() => onOpen(partner)}>
          Погледни повеќе
        </button>
      </div>
    </div>
  );
}
```

```tsx
// components/vendor-partners/PartnerDetailModal.tsx
"use client";

import { useState } from "react";
import { Modal } from "@/components/venue/dashboard/Modal";
import { ImageLightbox } from "@/components/venue/dashboard/ImageLightbox";
import { internationalPhone } from "@/lib/couple/invite-share";
import { getVendorPartnerPhotoUrl, type VendorPartner } from "@/lib/vendor-partners/partners";
import { CATEGORY_LABELS } from "./PartnerCard";

export function PartnerDetailModal({ partner, onClose }: { partner: VendorPartner; onClose: () => void }) {
  const [zoomed, setZoomed] = useState<{ src: string; alt: string } | null>(null);
  const galleryUrls = partner.gallery_photo_paths.map((p) => getVendorPartnerPhotoUrl(p)).filter((u): u is string => !!u);

  return (
    <Modal title={partner.name} onClose={onClose}>
      <span className="pv-card-category">{CATEGORY_LABELS[partner.category]}</span>
      <p className="pv-card-city">{partner.city}</p>
      {partner.full_description ? <p className="pv-detail-desc">{partner.full_description}</p> : <p className="pv-detail-desc">{partner.short_description}</p>}
      {galleryUrls.length > 0 ? (
        <div className="pv-gallery">
          {galleryUrls.map((url, i) => (
            <button key={url} type="button" className="pv-gallery-thumb" onClick={() => setZoomed({ src: url, alt: `${partner.name} ${i + 1}` })}>
              {/* eslint-disable-next-line @next/next/no-img-element -- variably-sized gallery thumbnails from Supabase Storage. */}
              <img src={url} alt={`${partner.name} ${i + 1}`} />
            </button>
          ))}
        </div>
      ) : null}
      <div className="pv-card-contacts">
        {partner.phone ? <a className="btn btn-ghost" href={`tel:${partner.phone}`}>{partner.phone}</a> : null}
        {internationalPhone(partner.whatsapp_phone) ? <a className="btn btn-ghost" href={`https://wa.me/${internationalPhone(partner.whatsapp_phone)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a> : null}
        {partner.viber_phone ? <a className="btn btn-ghost" href="viber://forward" target="_blank" rel="noopener noreferrer">Viber</a> : null}
        {partner.website_url ? <a className="btn btn-ghost" href={partner.website_url} target="_blank" rel="noopener noreferrer">Веб-страница</a> : null}
        {partner.instagram_url ? <a className="btn btn-ghost" href={partner.instagram_url} target="_blank" rel="noopener noreferrer">Instagram</a> : null}
        {partner.facebook_url ? <a className="btn btn-ghost" href={partner.facebook_url} target="_blank" rel="noopener noreferrer">Facebook</a> : null}
      </div>
      {zoomed ? <ImageLightbox src={zoomed.src} alt={zoomed.alt} onClose={() => setZoomed(null)} /> : null}
    </Modal>
  );
}
```

```tsx
// components/vendor-partners/PartnerDirectory.tsx
"use client";

import { useMemo, useState } from "react";
import { PartnerCard, CATEGORY_LABELS } from "./PartnerCard";
import { PartnerDetailModal } from "./PartnerDetailModal";
import type { VendorPartner, VendorPartnerCategory } from "@/lib/vendor-partners/partners";
import "./partner-directory.css";

export function PartnerDirectory({ partners }: { partners: VendorPartner[] }) {
  const [category, setCategory] = useState<VendorPartnerCategory | "">("");
  const [city, setCity] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<VendorPartner | null>(null);

  const cities = useMemo(() => Array.from(new Set(partners.map((p) => p.city))).sort(), [partners]);

  const filtered = partners.filter((p) => {
    if (category && p.category !== category) return false;
    if (city && p.city !== city) return false;
    if (search && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  if (partners.length === 0) {
    return <p className="pv-empty">Нема соработници во моментов.</p>;
  }

  return (
    <div className="pv-directory">
      <div className="pv-filters">
        <div>
          <label className="lab-s" htmlFor="pv-category">Категорија</label>
          <select id="pv-category" className="fld" value={category} onChange={(e) => setCategory(e.target.value as VendorPartnerCategory | "")}>
            <option value="">Сите категории</option>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="lab-s" htmlFor="pv-city">Град</label>
          <select id="pv-city" className="fld" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Сите градови</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="lab-s" htmlFor="pv-search">Пребарај по име</label>
          <input id="pv-search" className="fld" type="text" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      {filtered.length === 0 ? (
        <p className="pv-empty">Нема резултати за избраните филтри.</p>
      ) : (
        <div className="pv-grid">
          {filtered.map((p) => (
            <PartnerCard key={p.id} partner={p} onOpen={setOpen} />
          ))}
        </div>
      )}
      {open ? <PartnerDetailModal partner={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
```

```css
/* components/vendor-partners/partner-directory.css */
.pv-filters { display: flex; flex-wrap: wrap; gap: 14px; margin-bottom: 16px; }
.pv-filters > div { display: flex; flex-direction: column; gap: 4px; min-width: 160px; }
.pv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.pv-card { position: relative; border: 1px solid #e8e0cc; border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; background: #fff; }
.pv-card-badge { position: absolute; top: 8px; left: 8px; z-index: 1; background: #b8860b; color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 999px; }
.pv-card-cover { aspect-ratio: 16 / 9; background: #f4efe2; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.pv-card-cover img { width: 100%; height: 100%; object-fit: cover; }
.pv-card-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
.pv-card-category { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #8a7d64; }
.pv-card-name { margin: 0; font-size: 16px; }
.pv-card-city { font-size: 12.5px; color: #8a7d64; }
.pv-card-desc { font-size: 13px; margin: 4px 0; }
.pv-card-contacts { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0; }
.pv-card-open { align-self: flex-start; margin-top: 6px; }
.pv-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 8px; margin: 12px 0; }
.pv-gallery-thumb { padding: 0; border: 0; background: none; cursor: pointer; aspect-ratio: 1; overflow: hidden; border-radius: 6px; }
.pv-gallery-thumb img { width: 100%; height: 100%; object-fit: cover; }
.pv-detail-desc { white-space: pre-wrap; }
.pv-empty { color: #8a7d64; padding: 20px 0; text-align: center; }
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npm run test:unit -- tests/components/vendor-partners`
Expected: PASS, all tests green. Uses the existing `ic-case` sprite id for the no-cover-photo placeholder — no new icon needed.

- [ ] **Step 5: Commit**

```bash
git add components/vendor-partners tests/components/vendor-partners
git commit -m "feat: add shared vendor-partner directory UI components"
```

---

### Task 5: Admin screen

**Files:**
- Create: `app/admin/(panel)/vendors/page.tsx`
- Create: `components/admin/VendorPartnersClient.tsx`
- Modify: `components/admin/nav.ts`
- Test: `tests/components/admin/VendorPartnersClient.test.tsx`

**Interfaces:**
- Consumes: Task 2's `listVendorPartners`, `VendorPartner`; Task 3's `createVendorPartner`/`updateVendorPartner`/`deleteVendorPartner`/`uploadVendorPartnerPhoto`/`removeVendorPartnerGalleryPhoto` (imported from `app/admin/(panel)/vendors/actions.ts`); Task 3's `VENDOR_PARTNER_CATEGORIES`; Task 4's `CATEGORY_LABELS`, `PartnerCard`.
- Produces: `/admin/vendors` route; admin nav entry.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/admin/VendorPartnersClient.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VendorPartnersClient } from "@/components/admin/VendorPartnersClient";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

const { createVendorPartner, deleteVendorPartner } = vi.hoisted(() => ({
  createVendorPartner: vi.fn().mockResolvedValue({ ok: true, data: { id: "new-id" } }),
  deleteVendorPartner: vi.fn().mockResolvedValue({ ok: true, data: null }),
}));
vi.mock("@/app/admin/(panel)/vendors/actions", () => ({
  createVendorPartner,
  updateVendorPartner: vi.fn(),
  deleteVendorPartner,
  uploadVendorPartnerPhoto: vi.fn(),
  removeVendorPartnerGalleryPhoto: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const vendors: VendorPartner[] = [
  {
    id: "v1",
    category: "music",
    name: "Бенд Весели Моменти",
    city: "Скопје",
    short_description: "Свадбена музика",
    full_description: null,
    cover_photo_path: null,
    gallery_photo_paths: [],
    phone: null,
    viber_phone: null,
    whatsapp_phone: null,
    website_url: null,
    instagram_url: null,
    facebook_url: null,
    is_featured: false,
  },
];

describe("VendorPartnersClient", () => {
  it("lists existing vendors", () => {
    render(<VendorPartnersClient vendors={vendors} />);
    expect(screen.getByText("Бенд Весели Моменти")).toBeInTheDocument();
  });

  it("creates a new vendor from the add form", async () => {
    render(<VendorPartnersClient vendors={vendors} />);
    await userEvent.click(screen.getByRole("button", { name: /Додади соработник/i }));
    await userEvent.type(screen.getByLabelText(/^Име/i), "Нов Соработник");
    await userEvent.type(screen.getByLabelText(/^Град/i), "Велес");
    await userEvent.type(screen.getByLabelText(/Краток опис/i), "Опис");
    await userEvent.click(screen.getByRole("button", { name: /Зачувај/i }));
    expect(createVendorPartner).toHaveBeenCalledWith(expect.objectContaining({ name: "Нов Соработник", city: "Велес" }));
  });

  it("deletes a vendor after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<VendorPartnersClient vendors={vendors} />);
    await userEvent.click(screen.getByRole("button", { name: /Избриши/i }));
    expect(deleteVendorPartner).toHaveBeenCalledWith({ vendorId: "v1" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- tests/components/admin/VendorPartnersClient.test.tsx`
Expected: FAIL — `Cannot find module '@/components/admin/VendorPartnersClient'`.

- [ ] **Step 3: Write the implementation**

```tsx
// components/admin/VendorPartnersClient.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createVendorPartner,
  updateVendorPartner,
  deleteVendorPartner,
  uploadVendorPartnerPhoto,
  removeVendorPartnerGalleryPhoto,
} from "@/app/admin/(panel)/vendors/actions";
import { VENDOR_PARTNER_CATEGORIES } from "@/lib/admin/vendor-partners-actions-core";
import { CATEGORY_LABELS } from "@/components/vendor-partners/PartnerCard";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

type Draft = {
  category: VendorPartner["category"];
  name: string;
  city: string;
  shortDescription: string;
  fullDescription: string;
  phone: string;
  viberPhone: string;
  whatsappPhone: string;
  websiteUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  isFeatured: boolean;
};

const EMPTY: Draft = {
  category: "music",
  name: "",
  city: "",
  shortDescription: "",
  fullDescription: "",
  phone: "",
  viberPhone: "",
  whatsappPhone: "",
  websiteUrl: "",
  instagramUrl: "",
  facebookUrl: "",
  isFeatured: false,
};

function toInput(d: Draft) {
  return {
    category: d.category,
    name: d.name,
    city: d.city,
    shortDescription: d.shortDescription,
    fullDescription: d.fullDescription || null,
    phone: d.phone || null,
    viberPhone: d.viberPhone || null,
    whatsappPhone: d.whatsappPhone || null,
    websiteUrl: d.websiteUrl || null,
    instagramUrl: d.instagramUrl || null,
    facebookUrl: d.facebookUrl || null,
    isFeatured: d.isFeatured,
  };
}

export function VendorPartnersClient({ vendors }: { vendors: VendorPartner[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function remove(vendorId: string, name: string) {
    if (!window.confirm(`Да се избрише „${name}“?`)) return;
    const result = await deleteVendorPartner({ vendorId });
    if (result.ok) router.refresh();
    else setStatus(result.error);
  }

  return (
    <section className="panel">
      <div className="panel-h">
        <h2 className="panel-t">Соработници</h2>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          Додади соработник
        </button>
      </div>
      {status ? <p className="s1-empty">{status}</p> : null}
      {vendors.length === 0 ? <p className="s1-empty">Нема соработници. Додадете го првиот подолу.</p> : null}
      {vendors.map((v) => (
        <div key={v.id} className="s1-price-card">
          <div className="s1-price-card-head">
            <b>{v.name}</b>
            <span className="pill">{CATEGORY_LABELS[v.category]}</span>
            {v.is_featured ? <span className="pill p-ok">Издвоено</span> : null}
          </div>
          <p>{v.city} — {v.short_description}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setEditingId(v.id)}>Уреди</button>
            <button type="button" className="btn btn-ghost" onClick={() => remove(v.id, v.name)}>Избриши</button>
          </div>
          {editingId === v.id ? (
            <VendorForm
              vendorId={v.id}
              initial={{
                category: v.category,
                name: v.name,
                city: v.city,
                shortDescription: v.short_description,
                fullDescription: v.full_description ?? "",
                phone: v.phone ?? "",
                viberPhone: v.viber_phone ?? "",
                whatsappPhone: v.whatsapp_phone ?? "",
                websiteUrl: v.website_url ?? "",
                instagramUrl: v.instagram_url ?? "",
                facebookUrl: v.facebook_url ?? "",
                isFeatured: v.is_featured,
              }}
              coverPhotoPath={v.cover_photo_path}
              galleryPhotoPaths={v.gallery_photo_paths}
              onDone={() => {
                setEditingId(null);
                router.refresh();
              }}
            />
          ) : null}
        </div>
      ))}
      {adding ? (
        <VendorForm
          vendorId={null}
          initial={EMPTY}
          coverPhotoPath={null}
          galleryPhotoPaths={[]}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function VendorForm({
  vendorId,
  initial,
  coverPhotoPath,
  galleryPhotoPaths,
  onDone,
}: {
  vendorId: string | null;
  initial: Draft;
  coverPhotoPath: string | null;
  galleryPhotoPaths: string[];
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const input = toInput(draft);
    const result = vendorId ? await updateVendorPartner({ vendorId, ...input }) : await createVendorPartner(input);
    setPending(false);
    if (result.ok) onDone();
    else setError(result.error);
  }

  async function uploadCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !vendorId) return;
    const result = await uploadVendorPartnerPhoto({ vendorId, purpose: "cover", file });
    if (!result.ok) setError(result.error);
  }

  async function uploadGallery(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !vendorId) return;
    const result = await uploadVendorPartnerPhoto({ vendorId, purpose: "gallery", file });
    if (!result.ok) setError(result.error);
  }

  async function removeGalleryPhoto(path: string) {
    if (!vendorId) return;
    const result = await removeVendorPartnerGalleryPhoto({ vendorId, path });
    if (!result.ok) setError(result.error);
  }

  const uid = vendorId ?? "new";

  return (
    <form onSubmit={save} className="s1-price-fields">
      {error ? <p className="s1-empty">{error}</p> : null}
      <div>
        <label className="lab-s" htmlFor={`vp-category-${uid}`}>Категорија</label>
        <select id={`vp-category-${uid}`} className="fld" value={draft.category} onChange={(e) => set({ category: e.target.value as Draft["category"] })}>
          {VENDOR_PARTNER_CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-name-${uid}`}>Име</label>
        <input id={`vp-name-${uid}`} className="fld" value={draft.name} onChange={(e) => set({ name: e.target.value })} required />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-city-${uid}`}>Град</label>
        <input id={`vp-city-${uid}`} className="fld" value={draft.city} onChange={(e) => set({ city: e.target.value })} required />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-short-${uid}`}>Краток опис</label>
        <input id={`vp-short-${uid}`} className="fld" value={draft.shortDescription} onChange={(e) => set({ shortDescription: e.target.value })} required />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-full-${uid}`}>Целосен опис</label>
        <textarea id={`vp-full-${uid}`} className="fld" value={draft.fullDescription} onChange={(e) => set({ fullDescription: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-phone-${uid}`}>Телефон</label>
        <input id={`vp-phone-${uid}`} className="fld" value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-viber-${uid}`}>Viber</label>
        <input id={`vp-viber-${uid}`} className="fld" value={draft.viberPhone} onChange={(e) => set({ viberPhone: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-whatsapp-${uid}`}>WhatsApp</label>
        <input id={`vp-whatsapp-${uid}`} className="fld" value={draft.whatsappPhone} onChange={(e) => set({ whatsappPhone: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-website-${uid}`}>Веб-страница</label>
        <input id={`vp-website-${uid}`} className="fld" value={draft.websiteUrl} onChange={(e) => set({ websiteUrl: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-instagram-${uid}`}>Instagram</label>
        <input id={`vp-instagram-${uid}`} className="fld" value={draft.instagramUrl} onChange={(e) => set({ instagramUrl: e.target.value })} />
      </div>
      <div>
        <label className="lab-s" htmlFor={`vp-facebook-${uid}`}>Facebook</label>
        <input id={`vp-facebook-${uid}`} className="fld" value={draft.facebookUrl} onChange={(e) => set({ facebookUrl: e.target.value })} />
      </div>
      <label className="lab-s">
        <input type="checkbox" checked={draft.isFeatured} onChange={(e) => set({ isFeatured: e.target.checked })} /> Издвоено
      </label>
      {vendorId ? (
        <>
          <div>
            <label className="lab-s" htmlFor={`vp-cover-${uid}`}>Насловна фотографија {coverPhotoPath ? "(поставена)" : ""}</label>
            <input id={`vp-cover-${uid}`} className="fld" type="file" accept="image/*" onChange={uploadCover} />
          </div>
          <div>
            <label className="lab-s" htmlFor={`vp-gallery-${uid}`}>Додади фотографија во галеријата ({galleryPhotoPaths.length})</label>
            <input id={`vp-gallery-${uid}`} className="fld" type="file" accept="image/*" onChange={uploadGallery} />
            {galleryPhotoPaths.map((p) => (
              <button key={p} type="button" className="btn btn-ghost" onClick={() => removeGalleryPhoto(p)}>
                Отстрани {p.split("/").pop()}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={pending}>Зачувај</button>
    </form>
  );
}
```

```tsx
// app/admin/(panel)/vendors/page.tsx
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
```

Modify `components/admin/nav.ts`, adding one entry (after `plans`, before `pricing` — grouped with the other catalog-style screens):

```ts
  { href: "/admin/vendors", icon: "case", label: "Соработници" },
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:unit -- tests/components/admin/VendorPartnersClient.test.tsx`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/(panel)/vendors/page.tsx" components/admin/VendorPartnersClient.tsx components/admin/nav.ts tests/components/admin/VendorPartnersClient.test.tsx
git commit -m "feat: add admin vendor-partners screen"
```

---

### Task 6: Couple dashboard integration

**Files:**
- Modify: `components/couple/shell/nav.ts`
- Create: `app/couple/(protected)/partners/page.tsx`
- Test: `tests/lib/pure/couple-nav.test.ts` (extend existing nav test file if one exists; otherwise create it)

**Interfaces:**
- Consumes: Task 2's `listVendorPartners`; Task 4's `PartnerDirectory`.
- Produces: `/couple/partners` route reachable from the sidebar.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/pure/couple-nav.test.ts (add this case; create the file with this one case if it doesn't exist yet)
import { describe, it, expect } from "vitest";
import { buildCoupleNavItems } from "@/components/couple/shell/nav";

describe("couple nav", () => {
  it("places the vendor-partners entry right after Известувања", () => {
    const items = buildCoupleNavItems([]);
    const notifIndex = items.findIndex((i) => i.href === "/couple/notifications");
    const partnersIndex = items.findIndex((i) => i.href === "/couple/partners");
    expect(partnersIndex).toBe(notifIndex + 1);
    expect(items[partnersIndex].feature).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- tests/lib/pure/couple-nav.test.ts`
Expected: FAIL — no `/couple/partners` entry yet.

- [ ] **Step 3: Write the implementation**

In `components/couple/shell/nav.ts`, insert immediately after the Известувања entry and before the `...rooms.map(...)` spread:

```ts
    { href: "/couple", icon: "home", label: "Почетна", title: "ПОЧЕТНА", subtitle: "Преглед на вашиот настан", ready: true },
    { href: "/couple/notifications", icon: "bell", label: "Известувања", title: "ИЗВЕСТУВАЊА", subtitle: "Промени од салата и одговори од гости", ready: true, dot: dots.notifications },
    { href: "/couple/partners", icon: "case", label: "Услуги за настанот", title: "УСЛУГИ ЗА НАСТАНОТ", subtitle: "Проверени соработници за вашиот настан", ready: true },
    ...rooms.map((room, index) => ({
```

```tsx
// app/couple/(protected)/partners/page.tsx
// Global directory, not per-event — unlike most couple pages, it needs no
// x-couple-event-id header. Uses the same panel/panel-h/panel-t wrapper as
// app/couple/(protected)/notifications/page.tsx for visual consistency.
import { listVendorPartners } from "@/lib/vendor-partners/partners";
import { PartnerDirectory } from "@/components/vendor-partners/PartnerDirectory";

export const dynamic = "force-dynamic";

export default async function CouplePartnersPage() {
  const vendors = await listVendorPartners();
  return (
    <div className="wrap">
      <section className="panel">
        <div className="panel-h">
          <h2 className="panel-t">Услуги за настанот</h2>
        </div>
        <PartnerDirectory partners={vendors} />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:unit -- tests/lib/pure/couple-nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/couple/shell/nav.ts "app/couple/(protected)/partners/page.tsx" tests/lib/pure/couple-nav.test.ts
git commit -m "feat: add vendor-partners section to couple dashboard"
```

---

### Task 7: Landing page integration

**Files:**
- Create: `components/marketing/VendorPartnersSection.tsx`
- Modify: `app/page.tsx`
- Test: `tests/components/marketing/VendorPartnersSection.test.tsx`

**Interfaces:**
- Consumes: Task 2's `VendorPartner`; Task 4's `PartnerDirectory`.
- Produces: a public `#partners` section on the landing page.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/marketing/VendorPartnersSection.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VendorPartnersSection } from "@/components/marketing/VendorPartnersSection";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

function make(overrides: Partial<VendorPartner>): VendorPartner {
  return {
    id: "id",
    category: "music",
    name: "Name",
    city: "Скопје",
    short_description: "Опис",
    full_description: null,
    cover_photo_path: null,
    gallery_photo_paths: [],
    phone: null,
    viber_phone: null,
    whatsapp_phone: null,
    website_url: null,
    instagram_url: null,
    facebook_url: null,
    is_featured: false,
    ...overrides,
  };
}

describe("VendorPartnersSection", () => {
  it("renders nothing when there are no vendors yet", () => {
    const { container } = render(<VendorPartnersSection vendors={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the directory when there are vendors", () => {
    render(<VendorPartnersSection vendors={[make({ name: "Издвоен Бенд", is_featured: true })]} />);
    expect(screen.getByText("Издвоен Бенд")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:unit -- tests/components/marketing/VendorPartnersSection.test.tsx`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Write the implementation**

```tsx
// components/marketing/VendorPartnersSection.tsx
import { PartnerDirectory } from "@/components/vendor-partners/PartnerDirectory";
import type { VendorPartner } from "@/lib/vendor-partners/partners";

export function VendorPartnersSection({ vendors }: { vendors: VendorPartner[] }) {
  if (vendors.length === 0) return null;
  return (
    <section id="partners" className="band" aria-label="Соработници за вашиот настан">
      <h2>Проверени соработници за вашиот настан</h2>
      <p>Музика, декорација, кетеринг, цвеќе и уште — на едно место.</p>
      <PartnerDirectory partners={vendors} />
    </section>
  );
}
```

In `app/page.tsx`:
1. Add the import: `import { VendorPartnersSection } from "@/components/marketing/VendorPartnersSection";` and `import { listVendorPartners } from "@/lib/vendor-partners/partners";`.
2. Inside `export default async function Home()`, before the existing `return (`, add: `const vendorPartners = await listVendorPartners();`.
3. Render `<VendorPartnersSection vendors={vendorPartners} />` immediately after the `</section>` that closes the `id="platform"` band and before the `id="how"` section opens.

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test:unit -- tests/components/marketing/VendorPartnersSection.test.tsx`
Expected: PASS, 2/2.

- [ ] **Step 5: Run the full suite — including a real Next.js build**

Run: `npm run typecheck && npm run lint && npm run test:unit && npm run build`
Expected: all green. **`npm run build` is required, not optional** — it's the only check in this plan that catches a "server-only" module (`lib/vendor-partners/partners.ts`, `lib/admin/vendor-partners-actions-core.ts`) being imported, even just for a type or a re-exported constant, into a client component's module graph. Typecheck, lint, and vitest do not catch this class of bug; only Next.js's bundler does. This was discovered the hard way: the first version of this feature shipped with `getVendorPartnerPhotoUrl` and `VENDOR_PARTNER_CATEGORIES` defined inside server-only files and consumed directly by `PartnerCard.tsx`/`PartnerDetailModal.tsx`/`VendorPartnersClient.tsx`, which built fine under typecheck/lint/vitest but failed `next build` outright. Fix: anything a client component needs — even a plain constant or union type with zero server dependency — must live in a file with no `"server-only"` import at all (see `lib/vendor-partners/categories.ts` and `lib/vendor-partners/photo-url.ts`), never be re-exported as a *value* from a server-only file, and `export type { ... } from "./server-only-file"` is the one safe exception (type-only re-exports are erased at compile time). Run `npm run build` after every task that adds a new client component consuming shared library code, not just at the end.

Run `npm run test:db` separately too (the DB-dependent tests from Tasks 2–3 need the local Supabase stack running).

- [ ] **Step 6: Commit**

```bash
git add components/marketing/VendorPartnersSection.tsx app/page.tsx tests/components/marketing/VendorPartnersSection.test.tsx
git commit -m "feat: add vendor-partners section to the landing page"
```
