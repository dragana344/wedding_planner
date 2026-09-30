# SEC-005 - Invitation photo upload: any image, any size the platform allows, safely

**Category:** security · **Priority:** P0 · **Effort:** M · **Depends on:** none

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Decision given 27 Sep 2026 (no product size limit; formats chosen by engineering). Remaining approval is for the implementation: the upload call in InvitationClient changes from posting the file to the API to uploading via a signed URL - same look, same result.

## Context

DECIDED 27 Sep 2026: no product size limit, formats decided by engineering. What that means in practice: (1) SIZE - Vercel caps a function request body at 4.5 MB, so the current route (file posted through the Next.js server) would reject most phone photos with a bare 413. Switch to a signed upload URL: the route authenticates the couple and returns a Supabase Storage signed upload URL for a server-chosen path; the browser uploads straight to Storage. The only ceiling left is the Storage upload limit (50 MB default, raisable on Pro) - set the bucket's file_size_limit to that platform maximum explicitly, no lower product limit. (2) FORMATS - accept raster images a browser can display to every guest: JPEG, PNG, WebP, GIF, AVIF. Reject SVG (it can carry script and the bucket is public) and non-images. HEIC is not needed as a separate case: iOS converts HEIC to JPEG when a photo is picked in a browser file input. Enforce the list in the bucket (allowed_mime_types) and verify magic bytes server-side after upload before saving photo_path; derive the extension from the sniffed type, never from the filename. (3) Delete the previous object when a new photo replaces it.

## Coachfio reference

Coachfio sniffs the real file type instead of trusting the name or declared type, rejects anything outside a known list before storing it, and keeps every size ceiling in the stack consistent so the smallest one is never a silent wall.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/pipeline/media_admission.py`
- `api/main.py (_BodyCap)`
- `tests/test_body_caps.py`

Commits: `1f4c269`, `1792f7b`

## Steps

Target files:

- `lib/couple/invitations.ts (uploadInvitationPhoto)`
- `app/api/couple/invitation/photo/route.ts`
- `components/couple/InvitationClient.tsx (upload call only)`
- `supabase/migrations/00xx_invitation_photos_policy.sql (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A 20 MB JPEG from a phone uploads and renders on /invite/<slug>.
- [ ] SVG, HTML renamed to .jpg, and non-image files are refused and nothing stays in the bucket.
- [ ] The bucket itself enforces allowed_mime_types and file_size_limit (migration).
- [ ] No request body through a Vercel function carries the photo.

## Verification

- Upload a 20 MB photo on a Vercel preview -> 200
- Upload evil.svg and a renamed .html -> refused
- `select allowed_mime_types, file_size_limit from storage.buckets where id = 'invitation-photos';`

## Out of scope

- Image resizing/compression.
- Changing the invitation page layout.
