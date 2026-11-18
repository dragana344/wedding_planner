# Retention and erasure (DATA-005, DATA-006, DATA-007)

Status: the **mechanisms** exist (migration `0043_privacy_functions.sql`, `lib/privacy/*`). The automatic **retention sweep is live** since migration `0170_couple_access_lifecycle.sql`: a daily Vercel cron (`/api/cron/retention`) lists the due events (`due_retention_event_ids()`, 0178) and erases each in its own call — event personal data goes 6 months after the event (the couple's access end), contact-form and demo-request messages after 6 months, closed support tickets 6 months after closing (since 0176).

What counts as personal data is listed in `docs/production/DATA-MAP.md`. Every column of every public table is classified in `tests/supabase/privacy-classification.ts`. `tests/supabase/privacy_guard.test.ts` fails when a new column appears without a classification.

## 1. What exists

| Mechanism | Where | What it does |
|---|---|---|
| Venue data export | `exportVenueData()` in `lib/privacy/export.ts`, `GET /api/venue/privacy/export`, Settings → "Податоци и приватност" → "Преземи ги податоците" | JSON with the venue, staff logins (email, created, last sign-in, via the Auth admin API), reservations, and for every event: couple fields, couple username (never the password hash), guests, notes, agenda, locations, budget, checklist + subtasks, invitation (+ public photo URL), custom menu picks and quantities, showcase photos (+ URLs), seating table labels. Excluded: secrets (password hashes, layout-lock hash, session tokens), `contact_submissions` (not venue data), `audit_log`. |
| Event data export | `exportEventData()` in `lib/privacy/export.ts` | The same per-event block, for one event (a couple's access request). Server-side only for now, no UI. |
| Event personal-data erasure | `erase_event_personal_data()` (SQL, one transaction) → `eraseEventPersonalData()` → `POST /api/venue/privacy/erase-event` → event form → "Избриши ги личните податоци за овој настан" (type the couple's names to confirm) | Deletes guests, notes, agenda, locations, budget, checklist (+ subtasks), invitation (+ photo, which also kills the public link), showcase photos (+ files), custom menu and quantities, couple credentials and sessions, and the support tickets the couple sent from their dashboard (+ their reply threads, since 0171). Blanks the contact fields, the seating drafts and table labels. Replaces `couple_names` with "Избришани податоци". Sets `events.personal_data_erased_at`. **Keeps** the event row: date, times, type, status, rooms, menu template, guest-count estimate, total price and deposit, so the venue's calendar and reports stay intact. An **automatic** erasure (reason `retention`, see the sweep below) also keeps the organizer's names and contacts (`couple_names`, `contact_email(_2)`, `contact_phone`, and a mini-event reservation's name/phone) as the venue's booking record; an erasure on request removes them. |
| Venue account deletion | `delete_venue_account()` (SQL, one transaction) → `deleteVenueAccount()` → `POST /api/venue/privacy/delete-account` → Settings → "Избриши ја сметката" (type the venue name to confirm) | Deletes the venue, which cascades to rooms, menus, events and everything under them, reservations and staff rows. Deletes the staff Auth users (only those with no other venue: today `venue_staff.user_id` is unique, so that is all of them). Removes every stored photo under the venue's and its events' paths. The user is signed out and sent to `/login`. |
| Admin-scheduled venue deletion | Admin → venue → "Бришење" → "Избриши локал" (type the venue name) sets `venues.deletion_scheduled_for` = now + **15 days** (0172, `scheduleRemoval` in `lib/admin/venue-actions-core.ts`); "Откажи бришење" clears it. The daily `/api/cron/retention` → `runScheduledVenueDeletions()` (`lib/privacy/retention.ts`) → `delete_scheduled_venue()` → `delete_venue_account()` | Until the date, the venue works normally and every venue page shows "Сметката на локалот ќе биде избришана на DD.MM.YYYY. Преземете ги вашите податоци пред тоа." with a link to the export. Couples keep their access until the venue is actually deleted. Each due venue is deleted on its own (re-checked under a row lock, so a cancel that wins the race keeps the venue); one failing venue is logged (`scheduled_venue_deletion_failed`) and retried the next day, the others still go. Staff Auth users and photos go exactly as in the account deletion above. The admin can also "Избриши веднаш" once a deletion is scheduled (typed name + confirm). **Live.** |
| Retention sweep | `due_retention_event_ids()`, `erase_event_personal_data()`, `purge_old_contact_submissions()`, `purge_closed_support_tickets()` (SQL, 0170/0176, split per call in 0178) → `runRetentionPurge()` in `lib/privacy/retention.ts` → Vercel cron `/api/cron/retention` (daily, 02:41 UTC) | Runs the event erasure (reason `retention`) on every not-yet-erased event whose couple-access end is before today (Skopje date): `coalesce(couple_access_extended_until, couple_access_until, event_date + 6 months)` — see `public.event_access_end()`. Cancelling an event ends access 30 days later (or at the normal end, if earlier); only the platform admin can extend it (admin → event → "Пристап на парот", audited). Deletes `contact_submissions` older than 6 months, and (since 0176) support tickets closed (`status = 'done'`) more than 6 months ago, with their threads; a reopened ticket has `resolved_at` cleared and is kept. Each event is erased in its own call (0178), so one slow or failing event is logged (`retention_event_erase_failed`) and retried the next day without holding up the rest. Returns `{"events_erased": n, "events_failed": f, "contact_submissions_deleted": m, "support_tickets_deleted": k, "files_removed": x}` plus the venue-deletion and Auth-user-retry counts. Staff Auth users a venue deletion could not remove are queued in `auth_user_deletion_retries` and retried by the same cron (0178). **Live.** The older `purge_expired_personal_data(months, months)` (0043) is kept but not scheduled. |
| Expired couple sessions | pg_cron job `purge-expired-couple-sessions` (migration 0032), 03:17 UTC daily | Deletes sessions that expired more than a day ago. Sessions expire 30 days after the last use (sliding). |
| Photos whose row is gone | Cleanup queue (migration 0038) + Vercel cron `/api/cron/storage-cleanup` (daily, 03:23 UTC), `scripts/storage-orphan-sweep.mjs` (one-off) | Files are queued when their row is deleted or the photo is replaced. The erasure functions also queue any other object under the subject's paths, and the API drains the queue right away. |
| Guests' album (photos, greetings, video greetings) | Tables `event_photos`, `event_greetings`, `event_albums`, the private `event-media` bucket (migration 0080) and `event-media-uploads` for unconfirmed photos (0081) | Erased with the event: a trigger on `events.personal_data_erased_at` deletes the rows and the album token and queues every file under the event's paths. Deleted with the venue by cascade (row triggers queue the files). Uploads never confirmed (`pending/…`) are swept by the daily storage-cleanup cron once they are 24 h old. |
| Album retention | `runMediaRetention()` in `lib/media/retention.ts`, run by the daily storage-cleanup cron | When `MEDIA_RETENTION_ENABLED=true`, with `days` = the event's package `photo_retention_days` (only an enabled feature with a positive limit purges; disabled, missing, unlimited (null) or 0 = kept forever, never purged): from 5 days before `event_date + days` the couple gets one email (if Resend is configured and the event has a contact email) naming the deletion date. Media are deleted on the later of `event_date + days` and the warning + 5 days, so switching retention on or shortening it never deletes an album without notice. The album's photos, greetings and guest link are then removed and audited (`event_media_purged`, counts only). A failing email is retried next run and does not hold up other albums. **Off while the variable is unset.** A package change applies from the next run; lowering the period still gives the couple the 5-day notice. |

Storage objects cannot be deleted from SQL (Supabase blocks it). The SQL functions queue them. The TypeScript wrappers drain the queue immediately. If that fails, the daily storage-cleanup cron retries, so a file is gone within 24 hours of its row (the privacy policy's "within 24 hours", `RETENTION_FACTS.deletedFileHours`). A sweep run by pg_cron relies on that cron for its files.

### Audit trail

Every action writes one `audit_log` row with no names or contact data:

| action | actor | details |
|---|---|---|
| `privacy_export` | staff (or system) | `{"scope": "venue", "events": n}` or `{"scope": "event"}` |
| `event_personal_data_erased` | staff; `system` for the retention sweep | `{"reason": "request" \| "retention"}` |
| `venue_account_deleted` | staff (also the admin's id for "Избриши веднаш"); `system` for a scheduled deletion run by the cron | `{"events": n, "staff_accounts": n}` |
| `event_deleted` (existing 0042 trigger) | `system`, one per event cascaded by an account deletion | date, type, status |
| `contact_submissions_purged` | system | `{"count": n, "months": m}` |
| `support_tickets_purged` (0176) | system | `{"count": n, "months": 6}` |
| `couple_access_extended` | admin | `{"old_end": date, "new_end": date}` |
| `venue_deletion_scheduled` | admin | `{"scheduled_for": timestamp}` |
| `venue_deletion_cancelled` | admin | `{"scheduled_for": timestamp}` (the date that was cancelled) |

Audit rows are append-only and keep the (deleted) venue/event/user ids. See open decision 4.

## 2. Retention periods

| Data | Period | Mechanism | Status |
|---|---|---|---|
| Guest and couple personal data of an event (everything the event erasure removes) | **6 months after `event_date`** (30 days after a cancellation, if earlier; admin can extend) | `due_retention_event_ids()` + `erase_event_personal_data()` via `/api/cron/retention` | **Live** |
| Contact-form messages and demo requests (`contact_submissions`) | **6 months after receipt** | `purge_old_contact_submissions()` via `/api/cron/retention` | **Live** |
| Couple sessions | 30 days after last use | pg_cron (0032) | **Live** |
| Orphaned photos (row deleted, photo replaced) | Removed at once by the API; at the latest by the next daily cleanup run (**within 24 hours**) | Cleanup queue + cron (0038) | **Live** |
| Support tickets (venue and couple) | **6 months after closing**; a couple's tickets go earlier with the event erasure (0171) | `purge_closed_support_tickets()` via `/api/cron/retention` (0176, 0178) | **Live** |
| Guests' album photos and greetings | **Per package: 15 / 30 / 40 / 60 days after `event_date`** (proposal from the pricing slides) | `runMediaRetention()` via the daily storage-cleanup cron; days per event from `photo_retention_days` (admin plans/overrides), switched on by `MEDIA_RETENTION_ENABLED=true` | Mechanism ready, **off** until the owner sets the switch. The default plan („Стандарден“) carries 15 days: check every plan's value before switching on. **Deploy:** `MEDIA_RETENTION_DAYS` is no longer read; remove it and use `MEDIA_RETENTION_ENABLED` |
| Unconfirmed album uploads | 24 hours | Hourly cron (`sweepStalePendingMedia`) | **Live** |
| Rate-limit windows | 1 day | pg_cron (0037) | **Live** |
| Event rows (date, rooms, status, finance) | As long as the venue account exists | Kept by the event erasure | Owner decision 2 |
| Venue account data | Until the venue deletes its account | Account deletion | Live |
| Venue account closed by the platform admin | **15 days** after the admin schedules it (the venue's export window, `RETENTION_FACTS.exportWindowAfterEndDays`) | `runScheduledVenueDeletions()` via `/api/cron/retention` (0172) | **Live** |
| Backups (Supabase daily, R2 dumps) | 7 days / 35 days (`BACKUPS.md`) | Provider / R2 lifecycle | Erased data survives in backups up to these windows. State this in COMP-001 |

These periods must match the privacy notice (COMP-001, `lib/legal/privacy.ts`, version 1.3); `tests/lib/pure/legal-parity.test.ts` checks the numbers against `RETENTION_FACTS`. If the album retention switch is turned on, the privacy policy, terms and DPA must first say so (they now state that the album goes with the event's other data).

## 3. The scheduled sweep

Scheduled since migration `0170_couple_access_lifecycle.sql` by the Vercel cron in `vercel.json` (`/api/cron/retention`, `41 2 * * *`, `Authorization: Bearer $CRON_SECRET`), which calls the sweep functions above with the service role (one call per due event) and drains the photo queue right away (the daily `/api/cron/storage-cleanup` retries anything left).

To check after a run:

```sql
select count(*) from events where personal_data_erased_at is null and public.event_access_end(id) < (now() at time zone 'Europe/Skopje')::date;  -- 0
select count(*) from contact_submissions where created_at < now() - interval '6 months';                                                        -- 0
select count(*) from couple_sessions where expires_at < now() - interval '1 day';                                                                -- 0
select count(*) from support_tickets where status = 'done' and resolved_at < now() - interval '6 months';                                       -- 0
```

To change a period, change `due_retention_event_ids()` / `purge_old_contact_submissions()` / `purge_closed_support_tickets()` (0178), `public.event_access_end()`, `lib/couple/access.ts` and `RETENTION_FACTS` together (tests/lib/pure/legal-parity.test.ts checks they agree).

## 4. Open decisions for the owner

1. **Retention periods** — decided: 6 months after the event for guest/couple data, 6 months for contact messages and demo requests, 6 months after closing for support tickets; scheduled (section 3).
2. **What an event erasure keeps.** It currently keeps the date, times, type, status, rooms, guest-count estimate, total price and deposit (for the venue's calendar, reports and possibly accounting). DATA-MAP counts date/type/finance as personal "in context". Should they also be anonymised or deleted after a longer period?
3. **Is anything kept on venue account deletion?** It is implemented as **full deletion**: nothing remains apart from the audit rows. If accounting rules require anonymised financial or reservation records to survive closure, `delete_venue_account` has to change (new migration). See the TODO in `lib/privacy/erase.ts`.
4. **Audit log after erasure.** `audit_log` is append-only and keeps user/venue/event ids (never names or contacts) after the subject is gone. Confirm this is acceptable as a security record, and set its own retention period.
5. **Who handles couple and guest requests.** Couples get a full download of their event's data in their dashboard ("Преземи сè", group A task 7) until their access ends; guests have no self-service. The venue can erase an event from the panel. Decide whether the venue or the platform fulfils other requests.
6. **Backups.** Erased data stays in backups for up to 7 days (Supabase) or 35 days (R2). Disclose this, or shorten the windows.
