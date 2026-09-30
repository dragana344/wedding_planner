# SEC-028 - Type and size limits on the venue photo buckets

**Category:** security · **Priority:** P1 · **Effort:** S · **Depends on:** SEC-005

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Staff can no longer upload non-image files (e.g. a PDF menu) to these buckets - confirm nobody relies on that.

## Context

Staff upload menu and showcase photos straight from the browser; the storage policies check the folder but not the file, and neither bucket sets allowed_mime_types or file_size_limit. Anything - HTML, SVG, a 50 MB video - can be put on a public URL under the product's storage domain. Apply the same image list as SEC-005 (JPEG, PNG, WebP, GIF, AVIF) at the bucket level.

## Coachfio reference

Coachfio admits an upload only after checking what it really is.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/pipeline/media_admission.py`

Commits: `1792f7b`

## Steps

Target files:

- `lib/venue/menus.ts:67`
- `lib/venue/showcase.ts:40`
- `supabase/migrations/00xx_venue_buckets_limits.sql (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Non-image and SVG uploads to both buckets are refused by Storage.
- [ ] Normal photos still upload.

## Verification

- Upload a .html to menu-item-photos as staff -> refused

## Out of scope

- Resizing.
