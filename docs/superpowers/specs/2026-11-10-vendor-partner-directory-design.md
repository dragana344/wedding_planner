# Vendor/Partner Directory — Design

**Status:** approved pending final user sign-off (see end of document)
**Origin:** client's "Помошници за вашиот настан" / "Брз пристап до премиум партнери" notes (see memory `project_vendor_marketplace_deferred.md`), scoped down in conversation to a much simpler version than `tvojasvadba.mk` or a generic ChatGPT-drafted brief the user also reviewed and rejected most of.

## 1. What this is

A small, admin-curated directory of wedding/event vendors (bands, decorators, caterers, florists, jewelers, equipment/event-setup, photographers, cake/dessert makers, makeup & hair), shown in two places: a public section on the marketing landing page, and a full browsable section inside the couple's event dashboard. There is **no vendor-facing product at all** — no vendor accounts, no login, no self-service editing, no submission/approval queue, no booking, no payment processing. A vendor contacts the business directly (phone/email/in person); staff enter and maintain the listing from an admin screen.

## 2. Explicitly out of scope (decided in conversation, do not build)

- Vendor accounts, vendor login, self-serve profile editing, submission/approval workflow.
- Booking/availability calendars, reservations.
- Payment processing or subscription billing for vendors.
- Tier-gating by the venue's own package (START/PREMIUM/ULTRA) — every couple sees the directory regardless of their venue's plan.
- A venue-dashboard section (the venue side doesn't need this; skip it entirely for now).
- "Service area" as distinct from a vendor's home city (just one city field).
- Pricing info field, guest-count filter, map view, pagination (dataset will be small for the foreseeable future — fetch-all-and-filter-client-side is fine).
- Reusing any external open-source directory package (`Mkdirs`, `BusinessDirectory`, or similar) — evaluated and rejected as a poor fit for this codebase's existing auth/design/data stack; building the (small) custom module is less total work and risk.
- A separate detail *page*/route — see §5.

## 3. Data model

One new table, `vendor_partners`, migration `supabase/migrations/0142_vendor_partners.sql` (next free number after `0141_event_wizard_room_layouts.sql`):

```sql
create table vendor_partners (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'music', 'decoration', 'catering', 'florist', 'jeweler',
    'equipment', 'photography', 'cakes_desserts', 'makeup_hair'
  )),
  name text not null,
  city text not null,
  short_description text not null,
  full_description text,
  cover_photo_path text,
  gallery_photo_paths text[] not null default '{}',
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

alter table vendor_partners enable row level security;
revoke all on vendor_partners from anon, authenticated;
grant all on vendor_partners to service_role;
-- Matches the existing `pricing_cards` (0085) convention for an
-- admin-managed, publicly-shown catalog: no client-side RLS read policy at
-- all. Every read (landing page, couple dashboard, admin) goes through
-- `lib/vendor-partners/partners.ts`'s server-side functions using the
-- service-role client — there is no direct client-side Supabase query
-- against this table from any component.
```

Category labels (Macedonian, for the UI, not stored in the DB): Музички групи, Декорација, Кетеринг, Цвеќари, Златари, Опрема и уредување, Фотографи, Торти и десерти, Шминка и фризура.

Storage: new public bucket `vendor-partner-photos`, same shape as `menu-item-photos` in `lib/venue/menus.ts` (path = `${vendorId}/${purpose}-${Date.now()}.${ext}`, `getPublicUrl`, `cacheControl` 1 year since each upload gets a fresh path).

## 4. Data layer

New file `lib/vendor-partners/partners.ts`, same shape as `lib/venue/menus.ts`:
- `listVendorPartners(client?) → VendorPartner[]` — the only read path both the landing page and the couple dashboard use (single source of truth, no duplicate listing logic).
- `getVendorPartner(id, client?) → VendorPartner | null`
- `createVendorPartner(input)`, `updateVendorPartner(id, input)`, `deleteVendorPartner(id)` — admin-only, called from admin server actions/API routes.
- `uploadVendorPartnerPhoto(vendorId, file, purpose: "cover" | "gallery") → path`
- `getVendorPartnerPhotoUrl(path) → string | null`

## 5. Shared UI: card + detail panel

Two shared components, under `components/vendor-partners/` (not `components/couple/` or `components/marketing/`, since both consume them):
- `PartnerCard.tsx` — cover photo, name, category label, city, short description, contact buttons (phone/Viber/WhatsApp same pattern as `EventEditForm.tsx:859-866`, plus website/Instagram/Facebook icons where present), "Погледни повеќе" button. Shows a small "Издвоено" badge when `is_featured`.
- `PartnerDetailModal.tsx` — wraps the existing `components/venue/dashboard/Modal.tsx` (it's a plain UI component with no auth dependency, safe to use from a public page too). Shows the photo gallery (click-to-enlarge, same pattern as `MenuCardContent.tsx`'s dish photos), full description, all contact methods, city/category. **No separate route/page** — clicking a card opens this modal in place, on both the landing page and the couple dashboard, closing back to the grid. This was an explicit correction from the user (not a profile page).

Filtering/search, built into a third shared component `PartnerDirectory.tsx` (category select + city select + name search input, all client-side over the full fetched list — no server-side search endpoint needed at this scale): used by both the landing section and the couple dashboard section, configured with a `variant: "public" | "dashboard"` prop only if visual differences turn out to be needed (expect none initially — same component, same data, per the "don't build two listing systems" principle).

## 6. Couple dashboard integration

- New nav entry in `components/couple/shell/nav.ts`, inserted immediately after the Известувања entry (before the per-room Распоред entries): `{ href: "/couple/partners", icon: "store", label: "Услуги за настанот", title: "УСЛУГИ ЗА НАСТАНОТ", subtitle: "Проверени соработници за вашиот настан", ready: true }`. No `feature` (no entitlement gate, per §2), no `group` (sits ungrouped, like Почетна/Известувања).
- New page `app/couple/(protected)/partners/page.tsx`, server component, calls `listVendorPartners()` directly (no venue/event scoping — this directory is global, not per-venue), renders `PartnerDirectory`.

## 7. Landing page integration

- New component `components/marketing/VendorPartnersSection.tsx`, new `<section id="partners" className="band">` added to `app/page.tsx` (placement: a natural spot is right after `#platform` or before `#pricing` — final placement is a small call to make during implementation, not worth a design decision here).
- Shows the same `PartnerDirectory`/`PartnerCard`/`PartnerDetailModal` components, fetching via the same `listVendorPartners()` — logged-out, public, no auth required (matches the existing public-read RLS policy in §3). Likely only shows `is_featured` vendors plus a "view all" expansion, or just shows everyone if the list stays small — a minor call for implementation, consistent with "don't build two systems."

## 8. Admin integration

- New nav entry in `components/admin/nav.ts`: `{ href: "/admin/vendors", icon: "store", label: "Соработници" }`.
- New page `app/admin/(panel)/vendors/page.tsx` + `components/admin/VendorPartnersClient.tsx`: a simple list (table or cards) of all vendors with add/edit/delete, each opening a form (in a `Modal`) with all the fields from §3, cover + gallery photo upload, and the `is_featured` toggle. No approval queue — creating a row here publishes it immediately.

## 9. Open items carried into implementation (not blocking, small calls)

- Exact icon name for "store" (nav icon) — pick whatever exists in `components/venue/shell/Icon.tsx`'s icon set, or add one if none fits.
- Exact landing-page section placement among the existing bands.
- Whether the landing section shows all vendors or only featured ones.

## 10. Why this is simpler than the two reference materials reviewed

- vs. `tvojasvadba.mk`: no vendor accounts, no quote-request form/inbox, no guest-count filter, no map, no pagination, far fewer categories, no separate profile *page* (modal instead).
- vs. the ChatGPT-drafted brief: no vendor self-service/approval workflow, no open-source package integration, no service-area multi-city, no pricing field, no payment-readiness architecture beyond the trivial `is_featured` boolean.
