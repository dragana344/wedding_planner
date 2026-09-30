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

The feature gate is `withCoupleEvent(handler, { feature: "<key>" })`. Limits come from `getEventFeatures(eventId)` in `lib/entitlements/server.ts`.

- **S3 seating:** the routes `seating/group`, `seating/redo`, `seating/seats` and `guests/[id]/seat` need `feature: "seating"`. `event_seat_assignments` has no trigger yet; the gate is enough for now. The table QR needs `feature: "print_qr"`.
- **S2 guests:**
  - The co-organizer routes and `create_co_organizer` need `co_organizers` (a gate plus a limit count).
  - `/api/couple/reminder` and the reminders cron need `reminders`.
  - The personal links (`guests/email`, `guests/sent`, tokens) need `personal_invite_links`.
  - `guests/import` must return the P0001 message „Достигнат е лимитот…“ through `errorResponse`.
  - An admin unlock is needed for co-organizer logins; today `admin_unlock_couple_login` only resets `event_credentials`.
- **S4 media:**
  - Upload of photos and greetings must enforce `storage_gb` and use `photo_retention_days` from `feature_limit` for the purge.
  - Gates needed: `photo_album`, `guest_greetings`, `video_greetings`.
  - Add `feature` to the couple nav items.
- **Venue reports (main):** `/venue/reports` must check `getVenueFeatures(venueId).reports` on the server before it shows any data, because a locked section still renders its page (D7).
- **Feature-gate test:** turn `tests/lib/api/feature-gate.test.ts` around so every POST/PUT/PATCH couple route either has `feature:` or is on an explicit "ungated" list.
- **`lib/origin.ts` (main):** use `resolveOrigin` for `redirectTo` in the admin staff password reset (`lib/admin/venue-actions-core.ts`) and in `scripts/make-admin.mjs`.
- **Venue pages:** after `getCurrentVenueId()`, add `if (!venueId) redirect("/venue")` for the case of a blocked venue on a soft navigation. There is no data leak today, only a possible error.

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
