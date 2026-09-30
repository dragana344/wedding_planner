# Session 1 handoff: admin dashboard and plans (branch `s1-admin`)

Status on 30.09.2026: all 21 plan tasks are done and reviewed, the final whole-branch review is clean, and the final fix round is in. The branch starts from `23dbb1e`. `main` already has later work from sessions 2 and 3 (`6119645` and after).

## Merging into `main`

The final reviewer tried the merge in a scratch copy. It produced 8 textual conflicts; with the resolutions below the result typechecks and the unit tests pass.

| File | Resolution |
|---|---|
| `lib/couple/session-verify.ts` | Keep main's shape (`CoupleSession`, `organizerSide`). Merge the selects into `"event_id, expires_at, created_at, event_co_organizers(side), events(venues(blocked_at))"`. Keep S1's `if (venue?.blocked_at) return null;` **before** the expiry checks. |
| `app/api/couple/login/route.ts` | Take main (`verifyCoupleLogin`, `createCoupleSession(result.eventId, result.organizerId)`). Re-insert S1's `events(venues(blocked_at))` check through the service role, answering 403 „Пристапот е привремено оневозможен.“, between the failure branch and the success log. It uses `result.eventId`, so it covers co-organizers too. |
| `proxy.ts` | Only the imports conflict. Keep `NextFetchEvent`, `isAdminHost`, the platform-settings imports and main's `COUPLE_ORGANIZER_SIDE_HEADER`. |
| `components/venue/shell/nav.ts` | Take main (Пораки removed, Извештаи `ready: true`) and add `feature: "reports"` to the Извештаи item. |
| `app/venue/panel.css`, `docs/production/DECISIONS.md` | Keep both sides; both only append. |
| `tests/supabase/privacy-classification.ts` | Merge `venues` into one entry: `plan_id: N, blocked_at: N, blocked_reason: C, address: P, phone: P, logo_path: N`. Add `status: N, handled_at: N` to `contact_submissions`. Keep everything main has (organizer_id, S2/S3 tables). |
| `next-env.d.ts` | Take main. Never commit S1's change to it. |

**Migrations:** S1 is 0047–0053, main has 0060–0077.
- A from-scratch run (`supabase db reset`) works in number order.
- **Deploy:** `supabase db push --linked` refuses to apply 0047–0053 if the prod database already has 0060+. Check `supabase migration list --linked` first. If needed, run a one-off `supabase db push --include-all`.
- Locally in the worktrees, S1's migrations were applied with `psql` and are not recorded in `schema_migrations`.

**Coverage:** the thresholds (unit 43/79/31/43, DB 87/70/88/87) are not met on `main` either (unit about 31%, DB about 82% lines). That affects the whole project and needs deciding at launch (Session 4): either raise coverage or ratchet the thresholds.

## Follow-ups for the other sessions (after the merge)

**Status 30.09.2026: done on branch `followups-entitlements`** (migrations 0083–0084, tests `tests/supabase/entitlement_followups.test.ts`, `tests/lib/api/guest-album-gate.test.ts`, `tests/lib/api/feature-gate.test.ts`). Open items are marked.

The feature gate is `withCoupleEvent(handler, { feature: "<key>" })`. Limits come from `getEventFeatures(eventId)` in `lib/entitlements/server.ts`.

- **S3 seating:** ✅ `seating/group`, `seating/redo`, `seating/seats`, `seating/history` and `guests/[id]/seat` carry `feature: "seating"`. `event_seat_assignments` still has no trigger; the gate is enough for now. **Open:** the table QR print page and `print_qr` (not an API route; not part of this batch).
- **S2 guests:**
  - ✅ The co-organizer routes carry `co_organizers`; the limit is a BEFORE INSERT trigger (0083) with „Достигнат е лимитот од {n} дополнителни организатори.“, shown to the couple through `errorResponse`.
  - ✅ `/api/couple/reminder` carries `reminders`; the reminders cron skips events without it (not claimed, not marked sent).
  - ✅ `guests/email` and `guests/sent` carry `personal_invite_links` (tokens are a column default, 0060 — there is no issuing endpoint).
  - ✅ `guests/import` passes the P0001 „Достигнат е лимитот…“ through `errorResponse` (the raw PostgREST error is thrown).
  - ✅ `admin_unlock_couple_login` also clears the event's co-organizer lockouts (0084).
- **S4 media:**
  - ✅ The album quota is the event's `storage_gb` (null = unlimited; a failed read fails uploads closed); the meter shows „Неограничено“ for null.
  - ✅ Retention uses each event's `photo_retention_days`: purged only when enabled with a positive limit (disabled, null or 0 = forever). The sweep stays off until `MEDIA_RETENTION_ENABLED=true` (replaces `MEDIA_RETENTION_DAYS`, owner decision).
  - ✅ Gates: couple `album/**` → `photo_album`, `greetings/**` → `guest_greetings`; public `/api/e/<token>/…` → `photo_album` / `guest_greetings` / `guest_greetings` + `video_greetings` for video (403 locked). The guest page hides what the package lacks.
  - ✅ The couple nav items already carried `feature` after the merge.
- **Venue reports (main):** ✅ `/venue/reports` checks `getVenueFeatures(venueId).reports.enabled` on the server and renders no data when locked (the panel shell shows the LockedBanner).
- **Feature-gate test:** ✅ inverted: every POST/PUT/PATCH under `app/api/couple` must declare `feature:` or be on the test's UNGATED list (with a reason).
- **`lib/origin.ts` (main):** ✅ `staffPasswordReset` passes `redirectTo` from `resolveOrigin` (`lib/admin/reset-redirect.ts`, `admin.` host mapped to the main host); `scripts/make-admin.mjs` uses `NEXT_PUBLIC_SITE_URL` when set.
- **Venue pages:** ✅ every server page under `app/venue` that used `venueId!` now does `if (!venueId) return null;` so the layout decides (none → /login, blocked → BlockedScreen); E2E `e2e/blocked-venue.spec.ts`.

## Deferred minor items (not urgent)

- `unlock`/`regenerate` for an event without couple credentials report success, and the audit records it.
- The UX of „Од нивото“ in the override editor silently deletes the note.
- There's no component test for showing the couple's new password once.
- The E2E check `not.toBe(403)` is weak.
- The maintenance test doesn't exercise the 1.5 s timeout.

## For the owner

- Create the admin with `node --env-file=<prod env> scripts/make-admin.mjs <email>`, then enable TOTP. Details are in `docs/production/ADMIN.md`.
- `admin.<domain>` must be added as a domain on the same Vercel project, and the Supabase Auth redirect `https://admin.<domain>/**` must be set up.
- The admin host relies on `x-forwarded-host` being overwritten by Vercel. Don't expose `next start` directly to the internet.
