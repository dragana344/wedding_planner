# Retention and erasure (DATA-005, DATA-006, DATA-007)

Status: the **mechanisms** exist (migration `0043_privacy_functions.sql`, `lib/privacy/*`). The automatic **retention sweep is not scheduled**: the periods below are proposals that the owner has to approve (and COMP-001's privacy notice has to state) first.

What counts as personal data is listed in `docs/production/DATA-MAP.md`. Every column of every public table is classified in `tests/supabase/privacy-classification.ts`. `tests/supabase/privacy_guard.test.ts` fails when a new column appears without a classification.

## 1. What exists

| Mechanism | Where | What it does |
|---|---|---|
| Venue data export | `exportVenueData()` in `lib/privacy/export.ts`, `GET /api/venue/privacy/export`, Settings → "Податоци и приватност" → "Преземи ги податоците" | JSON with the venue, staff logins (email, created, last sign-in, via the Auth admin API), reservations, and for every event: couple fields, couple username (never the password hash), guests, notes, agenda, locations, budget, checklist + subtasks, invitation (+ public photo URL), custom menu picks and quantities, showcase photos (+ URLs), seating table labels. Excluded: secrets (password hashes, layout-lock hash, session tokens), `contact_submissions` (not venue data), `audit_log`. |
| Event data export | `exportEventData()` in `lib/privacy/export.ts` | The same per-event block, for one event (a couple's access request). Server-side only for now, no UI. |
| Event personal-data erasure | `erase_event_personal_data()` (SQL, one transaction) → `eraseEventPersonalData()` → `POST /api/venue/privacy/erase-event` → event form → "Избриши ги личните податоци за овој настан" (type the couple's names to confirm) | Deletes guests, notes, agenda, locations, budget, checklist (+ subtasks), invitation (+ photo, which also kills the public link), showcase photos (+ files), custom menu and quantities, couple credentials and sessions. Blanks the contact fields, the seating drafts and table labels. Replaces `couple_names` with "Избришани податоци". Sets `events.personal_data_erased_at`. **Keeps** the event row: date, times, type, status, rooms, menu template, guest-count estimate, total price and deposit, so the venue's calendar and reports stay intact. |
| Venue account deletion | `delete_venue_account()` (SQL, one transaction) → `deleteVenueAccount()` → `POST /api/venue/privacy/delete-account` → Settings → "Избриши ја сметката" (type the venue name to confirm) | Deletes the venue, which cascades to rooms, menus, events and everything under them, reservations and staff rows. Deletes the staff Auth users (only those with no other venue: today `venue_staff.user_id` is unique, so that is all of them). Removes every stored photo under the venue's and its events' paths. The user is signed out and sent to `/login`. |
| Retention sweep | `purge_expired_personal_data(p_guest_data_months, p_contact_months)` (SQL) | Runs the event erasure (reason `retention`) on every not-yet-erased event whose `event_date` is older than `p_guest_data_months`, and deletes `contact_submissions` older than `p_contact_months`. Returns `{"events_erased": n, "contact_submissions_deleted": m}`. Periods under 1 month are rejected. **Not scheduled.** |
| Expired couple sessions | pg_cron job `purge-expired-couple-sessions` (migration 0032), 03:17 UTC daily | Deletes sessions that expired more than a day ago. Sessions expire 30 days after the last use (sliding). |
| Photos whose row is gone | Cleanup queue (migration 0038) + Vercel cron `/api/cron/storage-cleanup` (hourly), `scripts/storage-orphan-sweep.mjs` (one-off) | Files are queued when their row is deleted or the photo is replaced. The erasure functions also queue any other object under the subject's paths, and the API drains the queue right away. |

Storage objects cannot be deleted from SQL (Supabase blocks it). The SQL functions queue them. The TypeScript wrappers drain the queue immediately. If that fails, the hourly cron retries. A sweep run by pg_cron relies on the hourly cron for its files.

### Audit trail

Every action writes one `audit_log` row with no names or contact data:

| action | actor | details |
|---|---|---|
| `privacy_export` | staff (or system) | `{"scope": "venue", "events": n}` or `{"scope": "event"}` |
| `event_personal_data_erased` | staff; `system` for the retention sweep | `{"reason": "request" \| "retention"}` |
| `venue_account_deleted` | staff | `{"events": n, "staff_accounts": n}` |
| `event_deleted` (existing 0042 trigger) | `system`, one per event cascaded by an account deletion | date, type, status |
| `contact_submissions_purged` | system | `{"count": n, "months": m}` |

Audit rows are append-only and keep the (deleted) venue/event/user ids. See open decision 4.

## 2. Proposed retention periods (to approve)

| Data | Proposed period | Mechanism | Status |
|---|---|---|---|
| Guest and couple personal data of an event (everything the event erasure removes) | **12 months after `event_date`** | `purge_expired_personal_data(12, …)` | Mechanism ready, **not scheduled** |
| Contact-form messages (`contact_submissions`) | **24 months after receipt** | `purge_expired_personal_data(…, 24)` | Mechanism ready, **not scheduled** |
| Couple sessions | 30 days after last use | pg_cron (0032) | **Live** |
| Orphaned photos (row deleted, photo replaced) | Removed within the hour | Cleanup queue + cron (0038) | **Live** |
| Rate-limit windows | 1 day | pg_cron (0037) | **Live** |
| Event rows (date, rooms, status, finance) | As long as the venue account exists | Kept by the event erasure | Owner decision 2 |
| Venue account data | Until the venue deletes its account | Account deletion | Live |
| Backups (Supabase daily, R2 dumps) | 7 days / 35 days (`BACKUPS.md`) | Provider / R2 lifecycle | Erased data survives in backups up to these windows. State this in COMP-001 |

These periods must match the privacy notice (COMP-001) word for word before the sweep is scheduled.

## 3. Scheduling the sweep once approved

Add a new migration (next free number) with the approved periods. Do not run it in the dashboard (see `MIGRATIONS.md`):

```sql
-- NNNN_schedule_retention_sweep.sql (DATA-007): periods approved on <date> by <owner>.
select cron.schedule(
  'purge-expired-personal-data',
  '47 2 * * *',  -- daily, 02:47 UTC
  $$select public.purge_expired_personal_data(12, 24)$$
);
```

The job runs as `postgres`, which can execute the function. Photos queued by the sweep are removed by the hourly `/api/cron/storage-cleanup`.

To check after the first run:

```sql
select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'purge-expired-personal-data') order by start_time desc limit 5;
select count(*) from events where personal_data_erased_at is null and event_date < current_date - interval '12 months';  -- 0
select count(*) from contact_submissions where created_at < now() - interval '24 months';                               -- 0
select count(*) from couple_sessions where expires_at < now() - interval '1 day';                                       -- 0
```

To change a period, unschedule and reschedule in a new migration: `select cron.unschedule('purge-expired-personal-data');`.

## 4. Open decisions for the owner

1. **Retention periods** (section 2): 12 months for guest/couple data after the event and 24 months for contact messages are proposals. Approve them or give other values, and put them in COMP-001's text. Then schedule (section 3).
2. **What an event erasure keeps.** It currently keeps the date, times, type, status, rooms, guest-count estimate, total price and deposit (for the venue's calendar, reports and possibly accounting). DATA-MAP counts date/type/finance as personal "in context". Should they also be anonymised or deleted after a longer period?
3. **Is anything kept on venue account deletion?** It is implemented as **full deletion**: nothing remains apart from the audit rows. If accounting rules require anonymised financial or reservation records to survive closure, `delete_venue_account` has to change (new migration). See the TODO in `lib/privacy/erase.ts`.
4. **Audit log after erasure.** `audit_log` is append-only and keeps user/venue/event ids (never names or contacts) after the subject is gone. Confirm this is acceptable as a security record, and set its own retention period.
5. **Who handles couple and guest requests.** Couples and guests have no self-service. The venue can erase an event from the panel. A couple's export (`exportEventData`) exists server-side only. Decide whether the venue or the platform fulfils these requests, and whether couples get a button in `/couple`.
6. **Backups.** Erased data stays in backups for up to 7 days (Supabase) or 35 days (R2). Disclose this, or shorten the windows.
