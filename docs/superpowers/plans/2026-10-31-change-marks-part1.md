# Change marks Part 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Venue ↔ couple change marks with Видено (no seating), both Известувања pages with a colour legend, guest-reply "Ново" badges for the couple, and the 25/20/15-day final-numbers timeline with auto-send and venue-entered numbers.

**Architecture:** Postgres records every change to the tracked fields in `event_changes` (row triggers + two RPC-level recorders), labelled by side through a transaction-local setting that only the couple's RPCs set. Per-side "seen up to" lives in `event_change_seen`. Final numbers stay in `event_menu_submissions` (gains `source` and `unanswered`). Pure TypeScript decides marks, groups changes and computes the timeline; server routes expose them; React shows boxes, dots, badges and the two Известувања pages.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routing/layout APIs), Supabase Postgres + RLS, vitest (unit + DB configs), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-31-change-marks-part1-design.md`

## Global Constraints

- **No git commits, no staging.** The user decides about committing at the end.
- Next migration number is **0125**; one migration file per task that needs DB changes, numbered in task order (0125, 0126, …). Unique prefixes (CI checks).
- Every new table must satisfy `tests/supabase/rls_guard.test.ts`, `privacy_guard.test.ts` (+ `privacy-classification.ts`, `lib/privacy/export.ts`), `fk_indexes.test.ts`. Every new `app/api/couple/**` route/method must be added to `tests/supabase/couple-authz.test.ts` `ROUTES`.
- New `events` columns are NOT added to the staff column grant from 0117 (fail-closed), unless a task says so.
- Service-role writes only; RPCs: `security definer`, `set search_path = public, extensions, pg_temp`, `revoke all … from public, anon, authenticated; grant execute … to service_role`.
- Venue: all staff see marks; only a manager (elevation token, header `x-venue-manager-token`) can press Видено or act. 403 from a gated route goes through `reportElevationRejected()` (except `LOCKED_MESSAGE`).
- Couple: any organizer (main login or co-organizer) can press Видено.
- Contact values (S5) are personal data: exported, erased, and never shown to staff without manager elevation. Finance values (S6) are manager-only on the venue side.
- Dates: `todayIn()` / `VENUE_TIME_ZONE` from `lib/date.ts`; an event is past when `event_date < todayIn()`. No marks count on past events.
- UI copy is Macedonian, exactly as written in this plan. Match surrounding code style and comment density.
- Node 26 locally vs engines 22–24: use `npx -y -p node@22 -c '…'` for `npm ci`/build if needed.

### Exact copy (use verbatim)

| Key | Text |
|---|---|
| Section labels | S1 `Датум и време`, S2 `Простории`, S3 `Мени`, S4 `Број на гости`, S5 `Контакт`, S6 `Финансии`, S7 `Бројки за мени` |
| Changed label | `Променето` |
| Accept | `Видено` |
| Unseen sign | `Не е видено` |
| Side names | venue `Салата`; couple main login `Младенците`; co-organizer `Ко-организатор` |
| Auto-send | `Испратено автоматски — непотполно` and `{n} гости без одговор` |
| Venue-entered | `Внесено од салата` |
| Venue warning | `Бројките уште не се испратени` |
| Venue remind button | `Потсети го парот`; after: `Потсетено на {dd.mm.yyyy}` |
| Couple reminder | `Испратете ги конечните бројки до салата` |
| Couple venue-reminder item | `Салата ве потсети да ги испратите бројките` |
| Guest badge / filter / clear | `Ново` / `Само нови` / `Означи ги како видени` |
| Venue legend | yellow `Промени од парот`, green `Бројки за мени`, blue `Настани`, grey `Пристап`, red `Приватност` |
| Couple legend | yellow `Промени од салата`, green `Одговори од гости`, blue `Потсетници` |
| Couple nav item | `Известувања` (href `/couple/notifications`, icon `bell`) |
| Venue enter numbers | button `Внеси бројки`, save `Зачувај бројки` |
| Stale Видено (409) | `Има нови промени — освежете.` |

## Review Focus

1. **Creation noise:** creating an event (and its custom menu right after) must never show the couple "changes" — couple marks only count changes after `couple_first_login_at` (null ⇒ no couple marks). Test in Task 2/3.
2. **Erasure:** `erase_event_personal_data` must create no change rows and must null contact values already in `event_changes`. Test in Task 1.
3. **Stale Видено:** pressing Видено for changes the viewer saw must not hide a change that arrived meanwhile (`up_to` is the newest change shown, server keeps `greatest`). Test in Tasks 2/4.
4. **Staff privacy:** a staff session without manager token never receives contact/finance values (lists/notifications show the section only). Test in Tasks 4/8.
5. **Timeline edges:** event created within 15 days ⇒ no auto-send; already-sent ⇒ no reminders/auto-send; event with no menus ⇒ no auto-send; cron running twice ⇒ one auto submission. Test in Task 6.

---

### Task 1: Database — change log, seen state, recorders

**Files:**
- Create: `supabase/migrations/0125_event_change_marks.sql`
- Create: `tests/supabase/event_changes.test.ts`
- Modify: `tests/supabase/rls_guard.test.ts`, `tests/supabase/privacy-classification.ts`, `lib/privacy/export.ts` (and any guard list the tests demand)

**Interfaces — Produces:**
- Table `event_changes(id uuid pk default gen_random_uuid(), event_id uuid not null fk events on delete cascade, section text not null check in ('date_time','rooms','menus','guest_count','contact','finance'), side text not null check in ('venue','couple'), changed_by text null, field text not null, old_value jsonb null, new_value jsonb null, changed_at timestamptz not null default clock_timestamp())`; index `(event_id, changed_at desc)`. Service-role only (RLS on, no policies, revoke from anon/authenticated).
- Table `event_change_seen(event_id uuid fk cascade, viewer text check in ('venue','couple'), section text check in ('date_time','rooms','menus','guest_count','contact','finance','menu_numbers','guest_replies'), seen_up_to timestamptz not null, seen_by text null, primary key(event_id, viewer, section))`. Service-role only.
- Column `events.couple_first_login_at timestamptz null` (not granted to staff).
- Columns on `event_menu_submissions`: `source text not null default 'couple' check in ('couple','auto','venue')`, `unanswered int null`.
- Table `event_couple_reminders(id uuid pk, event_id uuid fk cascade, reminded_at timestamptz not null default now(), reminded_by text not null)`; index on event_id. Service-role only.
- Side setting: recorders read `current_setting('app.change_side', true)`; `'couple'` ⇒ side couple, `'erase'` ⇒ record nothing, anything else ⇒ side venue. `current_setting('app.change_by', true)` ⇒ `changed_by` (null when empty).
- RPC `couple_set_guest_count(p_event_id uuid, p_count int, p_changed_by text) returns void` — sets both settings with `set_config(…, true)` then updates.
- RPC `couple_set_contact_info(p_event_id uuid, p_email text, p_email_2 text, p_phone text, p_changed_by text) returns void` — same.
- RPC `record_couple_first_login(p_event_id uuid) returns void` — `couple_first_login_at = coalesce(couple_first_login_at, now())`.
- RPC `venue_unseen_change_sections(p_venue_id uuid) returns table(event_id uuid, section text)` — `security definer`, allowed for service_role or `is_venue_staff_for(p_venue_id)` (grant execute to authenticated too); returns sections where a **couple** change is newer than the venue's `seen_up_to` (missing row ⇒ epoch) and `event_date >= (now() at time zone 'Europe/Skopje')::date`. Plus `('menu_numbers')` when the newest submission has `seen_at is null` and source <> 'venue'. No values.

**Recording rules (triggers, all `after`, row-level, functions revoked from public/anon/authenticated):**
- `events` UPDATE: one row per changed section, `field` = section name, `old_value`/`new_value` objects: date_time `{date,start,end}` (any of event_date/start_time/end_time differs), guest_count `{count}`, contact `{email,email_2,phone}`, finance `{total,deposit}`.
- `event_rooms` INSERT/DELETE: section rooms, field `added`/`removed`, value `{id, name}` (room name looked up; on delete use `old.room_id`).
- `event_menu_templates` INSERT/DELETE: section menus, field `added`/`removed`, value `{id, name, custom: bool}`.
- `menu_templates` UPDATE of `name` where `event_id is not null`: section menus, field `renamed`, `{name}` → `{name}`.
- Custom dishes: modify `replace_menu_template_items` (latest def 0118) so that when the template has `event_id`, it compares old vs new dish id sets and, if different, inserts one row section menus, field `dishes`, values `{menu, dishes:[names sorted]}`.
- Every recorder skips when the event row no longer exists (cascade delete) and when setting is `'erase'`.
- `erase_event_personal_data` (latest def 0122): first `perform set_config('app.change_side','erase', true)`; additionally `update event_changes set old_value = null, new_value = null where event_id = p_event_id and section = 'contact'`.
- Keep `update_event_full` / `create_event_full` signatures unchanged.

- [ ] **Step 1: Write failing DB tests** in `tests/supabase/event_changes.test.ts` (pattern: `tests/supabase/menu_submissions.test.ts`, service-role `admin` client, own venue/event):
  - `update_event_full` changing date+guest count records two rows (`date_time`, `guest_count`), side `venue`, correct old/new.
  - room diff records `added`/`removed` with names; menu link diff records `added`/`removed`; custom menu rename and dish change record `renamed` and `dishes` (via `replace_menu_template_items`).
  - `couple_set_guest_count` records side `couple`, `changed_by` as passed; `couple_set_contact_info` likewise.
  - Direct service-role update of finance records `finance` side `venue`.
  - `erase_event_personal_data` records nothing and nulls existing contact values.
  - Deleting the event leaves no rows and does not error.
  - `venue_unseen_change_sections`: couple change ⇒ returned; after upserting `event_change_seen` with `seen_up_to >= changed_at` ⇒ not returned; past event ⇒ not returned; unseen couple submission ⇒ `menu_numbers`; staff of another venue ⇒ error.
  - `record_couple_first_login` sets once and never moves.
- [ ] **Step 2:** Run `npx vitest run -c vitest.db.config.ts tests/supabase/event_changes.test.ts` → FAIL.
- [ ] **Step 3:** Write the migration; apply with `npx supabase migration up --local`.
- [ ] **Step 4:** Update guard lists/classification/export (contact values personal ⇒ exported with the event; `changed_by`, `seen_by`, `reminded_by` classified as personal).
- [ ] **Step 5:** Run the new test, then `npm run test:db` → all PASS; `npx supabase db lint --local --level warning --fail-on error` → clean.

### Task 2: Change rules (pure) and server data access

**Files:**
- Create: `lib/changes/types.ts`, `lib/changes/rules.ts` (pure), `lib/changes/format.ts` (pure), `lib/changes/server.ts` (`import "server-only"`)
- Test: `tests/lib/pure/change-rules.test.ts`, `tests/lib/pure/change-format.test.ts`, `tests/supabase/change_server.test.ts`

**Interfaces — Produces:**
- `type ChangeSection = "date_time"|"rooms"|"menus"|"guest_count"|"contact"|"finance"`; `type SeenSection = ChangeSection|"menu_numbers"|"guest_replies"`; `type Side = "venue"|"couple"`.
- `type EventChange = { id; eventId; section: ChangeSection; side: Side; changedBy: string|null; field: string; oldValue: unknown; newValue: unknown; changedAt: string }`.
- `SECTION_LABELS: Record<SeenSection,string>` (copy table; `menu_numbers` = `Бројки за мени`, `guest_replies` = `Одговори од гости`).
- `SECTIONS_FOR_VIEWER: Record<Side, ChangeSection[]>` = couple: date_time, rooms, menus, guest_count, contact, finance; venue: guest_count, contact.
- `unseenChanges(changes: EventChange[], viewer: Side, seen: Partial<Record<SeenSection,string>>, opts: { eventDate: string; today: string; coupleFirstLoginAt: string|null }): EventChange[]` — other side's changes in the viewer's sections, newer than seen; `[]` when event past; for viewer couple also newer than `coupleFirstLoginAt` and `[]` when it is null.
- `groupBySection(changes): Partial<Record<ChangeSection, EventChange[]>>` (each list oldest first).
- `describeChange(change, opts: { redactPrivate: boolean }): string` — e.g. `01.06.2027 18:00–23:00 → 02.06.2027 18:00–23:00`, `120 → 150`, `Додадена: Сала А`, `Отстрането: Посно мени`, `Ново име: X → Y`, `Јадења: A, B → A, C`; contact/finance with `redactPrivate` ⇒ `Контакт е променет` / `Финансиите се променети`. Money via `formatDen` (`lib/money`), dates `dd.mm.yyyy`.
- `sideName(side, changedBy): string` — venue ⇒ `Салата`; couple ⇒ `changedBy ?? "Младенците"`.
- Server (`lib/changes/server.ts`, service-role client):
  - `listEventChanges(eventId: string, since?: string): Promise<EventChange[]>`
  - `getSeen(eventId, viewer: Side): Promise<Partial<Record<SeenSection,string>>>`
  - `markSeen(eventId, viewer: Side, section: SeenSection, upTo: string, seenBy: string|null): Promise<void>` — upsert keeping `greatest(existing, upTo)`.
  - `getCoupleFirstLogin(eventId): Promise<string|null>`
  - `coupleChangerName(side: "bride"|"groom"|null): string` ⇒ null side `Младенците`, else `Ко-организатор`.

- [ ] Step 1: unit tests for `unseenChanges` (own side excluded, seen threshold, past event, first-login rule incl. null), `groupBySection`, every `describeChange` shape incl. redaction, `sideName`.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: DB test for server functions (markSeen keeps the greater value when called with an older `upTo` — Review Focus 3). Step 5: run → PASS.

### Task 3: Couple write paths and first login

**Files:**
- Modify: `app/api/couple/guest-count/route.ts`, `app/api/couple/contact-info/route.ts`, `app/api/couple/login/route.ts`
- Test: `tests/supabase/couple_change_writes.test.ts`

**Interfaces — Consumes:** Task 1 RPCs; `organizerSide(request)` (`lib/couple/organizer-side.ts`); `coupleChangerName` (Task 2).

- [ ] Step 1: failing DB tests: PATCH guest-count records side couple with `changed_by` `Младенците` (no side header) or `Ко-организатор` (side header); contact-info likewise; login route success calls `record_couple_first_login` (call the route handler with a real event's credentials as `tests/supabase` login tests do, or assert via RPC if the login route is not directly testable — check existing login tests first).
- [ ] Step 2: FAIL. Step 3: replace the two direct updates with the RPCs (keep response shapes); in login, call `record_couple_first_login` after the blocked-venue check and before the session is created; a failure there must not block login (log and continue). Step 4: PASS; existing couple route tests still pass.

### Task 4: Venue API — changes, Видено, remind, enter numbers

**Files:**
- Create: `app/api/venue/events/[eventId]/changes/route.ts` (GET), `app/api/venue/events/[eventId]/changes/seen/route.ts` (POST), `app/api/venue/events/[eventId]/remind-couple/route.ts` (POST), and POST in `app/api/venue/events/[eventId]/menu-numbers/route.ts` (new file; `seen/` already exists below it)
- Create: `lib/venue/changes-client.ts` (browser helpers, pattern `lib/venue/menu-numbers-client.ts`)
- Test: `tests/supabase/venue_changes_api.test.ts`, `tests/lib/pure/venue-changes-client.test.ts`

**Behaviour:**
- GET changes: any venue staff of the event (`requireManagerForEvent`-like guard but staff allowed — reuse the guard that venue staff routes use; check `lib/venue/event-guard.ts`). Returns `{ changes: EventChange[] (couple side only, last 60 days), seen: Partial<Record<SeenSection,string>> }`. Contact `oldValue/newValue` replaced by `null` unless a valid manager token is sent.
- POST changes/seen: manager only; body `{ section: "guest_count"|"contact", up_to: string }`; `markSeen(eventId,"venue",section,up_to,managerName)`; returns `{ok:true}`. If a couple change in that section is newer than `up_to`, still saves but returns `{ok:true, newer:true}` (UI then shows `Има нови промени — освежете.`).
- POST remind-couple: manager only; refuses (409 `Бројките се веќе испратени.`) if any submission exists; refuses (429 `Веќе потсетивте денес.`) if a reminder exists with the same Skopje date; inserts `event_couple_reminders(reminded_by = managerName)`; returns `{ remindedAt }`.
- POST menu-numbers (venue-entered): manager only; body `{ counts: Record<uuid, int ≥ 0> }`; every key must be one of the event's menus (else 400 `Непознато мени.`); inserts submission `source 'venue'`, `sent_by = managerName`, `menu_titles` from current menu names, `total = sum`, `seen_at = now()`, `seen_by = managerName`, `unanswered = null`. Past event ⇒ 409 (reuse `assertEventNotPast`).
- Client helpers: `fetchEventChanges(eventId, token)`, `markChangesSeenViaApi(eventId, section, upTo, token): Promise<{newer: boolean}>`, `remindCoupleViaApi(eventId, token)`, `enterMenuNumbersViaApi(eventId, counts, token)`.

- [ ] Steps: failing tests (staff gets redacted contact values; manager gets values; staff cannot POST seen/remind/numbers (403); remind once per day; remind refused after a submission; venue numbers stored with source venue and seen; unknown menu 400), implement, PASS. Unit tests for client helpers (403 → `reportElevationRejected`, LOCKED not).

### Task 5: Couple API — changes, Видено, guest replies, notifications

**Files:**
- Create: `app/api/couple/changes/route.ts` (GET), `app/api/couple/changes/seen/route.ts` (POST), `lib/couple/notifications.ts` (server), `lib/couple/guest-replies.ts` (server)
- Modify: `tests/supabase/couple-authz.test.ts` (`ROUTES` + seeds)
- Test: `tests/supabase/couple_changes_api.test.ts`

**Interfaces — Produces:**
- `listGuestReplies(eventId): Promise<{ id: string; guestId: string|null; guestName: string|null; at: string; previousStatus: string|null; newStatus: string }[]>` — audit_log `action='public_rsvp'` for the event, names joined from `event_guests` by `target_id`, newest first, limit 200.
- `listCoupleNotifications(eventId): Promise<CoupleNotification[]>` with `CoupleNotification = { id: string; at: string; kind: "venue_change"|"guest_reply"|"reminder"; section?: ChangeSection; title: string; detail: string|null; unseen: boolean }`:
  - venue_change: venue-side changes after `couple_first_login_at` (none if null); title = section label, detail = `describeChange(…, {redactPrivate:false})`; unseen per `unseenChanges`.
  - guest_reply: title = guest name (or `Нов гостин`), detail = new status label (`STATUS_LABELS`); unseen when `at > seen.guest_replies`.
  - reminder: the 25-day reminder (at = event_date − 25 days 09:00 Skopje, only when that is ≤ now, event not past, and no submission exists) with copy `Испратете ги конечните бројки до салата`; each `event_couple_reminders` row with `Салата ве потсети да ги испратите бројките`. Never unseen.
  - Sorted newest first.
- GET `/api/couple/changes` ⇒ `{ unseen: Partial<Record<ChangeSection, EventChange[]>>, venueNumbersUnseen: MenuSubmission|null }` — `venueNumbersUnseen` is the newest `source='venue'` submission newer than couple seen `menu_numbers`.
- POST `/api/couple/changes/seen` body `{ section: SeenSection, up_to: string }` ⇒ `markSeen(eventId,"couple",section,up_to, coupleChangerName(side))`.

- [ ] Steps: failing tests (first-login rule; seen hides; `newer` behaviour same as venue; guest replies listed with names and seen; reminders appear only under the rules; couple-authz coverage passes), implement, PASS.

### Task 6: Final-numbers timeline and auto-send

**Files:**
- Create: `lib/menu-timeline.ts` (pure), `lib/couple/menu-auto-send.ts` (server)
- Modify: `lib/couple/menu-submissions.ts` (source/unanswered in rows; `toMenuSubmission` gains `source` and `unanswered`), `lib/menu-numbers.ts` (`MenuSubmission` + `MenuSubmissionRow` gain `source: "couple"|"auto"|"venue"`, `unanswered: number|null`), `app/api/cron/reminders/route.ts`
- Test: `tests/lib/pure/menu-timeline.test.ts`, `tests/supabase/menu_auto_send.test.ts`, `tests/security/cron-reminders.test.ts` (update mocks)

**Interfaces — Produces:**
- `daysUntil(eventDate: string, today: string): number`
- `timelineStage(input: { eventDate: string; createdDate: string; today: string; sent: boolean }): "none"|"couple_reminder"|"venue_can_remind"|"auto_send"|"too_late_for_auto"` — `none` if sent or past or > 25 days; `couple_reminder` 25..21; `venue_can_remind` 20..16 (couple reminder still shown); at ≤ 15: `auto_send` when `daysUntil(eventDate, createdDate) > 15`, else `too_late_for_auto`.
- `runMenuAutoSend(now: Date): Promise<{ sent: string[] }>` — events with stage `auto_send`, ≥ 1 menu, no submission, not erased: insert submission `source 'auto'`, `sent_by 'Автоматски'`, numbers from `currentMenuNumbers(eventId)` (confirmed only), `unanswered = notDone.length`. Idempotent (re-check "no submission" inside the insert, e.g. `insert … where not exists`, via a small RPC `insert_auto_menu_submission(p_event_id, p_counts jsonb, p_titles jsonb, p_total int, p_unanswered int) returns boolean` in migration `0126_menu_auto_send.sql`).
- Cron: `runMenuAutoSend` runs in the reminders route independently of `emailConfigured()` (its own try/catch and log line `menu_auto_send` with `{sent}`); guest email reminders unchanged.

- [ ] Steps: failing unit tests for every stage boundary (26/25/21/20/16/15/0/−1, created late, sent); DB tests (auto-send inserts once with unanswered count; second run no-op; no menus ⇒ nothing; created within 15 days ⇒ nothing; past ⇒ nothing); implement; PASS. Existing menu-submission tests still pass.

### Task 7: Venue event window — change boxes, numbers states, remind, enter numbers

**Files:**
- Create: `components/venue/dashboard/ChangeBox.tsx`, `components/venue/dashboard/EnterMenuNumbers.tsx`
- Modify: `components/venue/dashboard/EventEditForm.tsx`, `components/venue/dashboard/MenuNumbersSection.tsx`, `app/venue/panel.css`
- Test: `tests/components/venue/dashboard/ChangeBox.test.tsx`, `tests/components/venue/dashboard/MenuNumbersSection.test.tsx` (extend or create), `tests/components/venue/dashboard/EventEditForm.test.tsx` (extend)

**Behaviour:**
- `ChangeBox({ section, changes, canConfirm, onSeen })`: strong gold border box with `Променето` label, one line per change `{sideName} · {dd.mm.yyyy HH:mm} · {describeChange}` (redact contact when values are null), `Видено` button only when `canConfirm`; on `newer:true` shows `Има нови промени — освежете.` and calls `onSeen` to refresh.
- EventEditForm loads `fetchEventChanges(event.id, managerToken)` on open; renders ChangeBox above Број на гости (S4) and inside Контакт на парот (S5) when that section has unseen couple changes (unseen computed with `unseenChanges(…, "venue", seen, …)`). The fieldset/field gets class `ev-changed`.
- MenuNumbersSection: latest submission label by source — couple: as today; auto: `Испратено автоматски — непотполно` + `{n} гости без одговор`; venue: `Внесено од салата`. When no submission and stage is `venue_can_remind` (or later without submission): warning `Бројките уште не се испратени` + `Потсети го парот` (manager) and `Потсетено на {date}` after; `Внеси бројки` (manager) opens EnterMenuNumbers (one number input per event menu, `Зачувај бројки`). Needs from EventDetail: `menus`, `event_date`, `created_at` (add `created_at` to `EVENT_DETAIL_COLUMNS` / `EventDetail` — it is already staff-readable) and latest reminder (fetched with changes: extend GET changes response with `lastReminderAt: string|null`).
- [ ] Steps: failing component tests (box renders lines and Видено only for manager; Видено calls API with newest `changedAt`; newer message; source labels; remind button hidden for staff, once pressed shows date; enter numbers posts counts), implement, PASS.

### Task 8: Venue marks — Настани count, "!" on events

**Files:**
- Modify: `lib/venue/events.ts` (`EventDetail.unseenSections: SeenSection[]` from `venue_unseen_change_sections` via the session client), `components/venue/dashboard/EventsClient.tsx`, `DashboardClient.tsx`, `WeekCalendarClient.tsx`, `components/venue/shell/nav.ts`, `VenueNav.tsx`, `PanelShell.tsx`, `app/venue/layout.tsx`, `app/venue/panel.css`
- Test: extend `tests/components/venue/dashboard/EventsClient*.test.tsx` (or create), `tests/components/venue/shell/VenueNav.test.tsx` (create if missing), DB test in `tests/supabase/venue_changes_api.test.ts` for `listEventsWithDetails` → `unseenSections`

**Behaviour:**
- `unseenSections` includes `menu_numbers` from the RPC (replaces the `hasUnseenMenuNumbers` check for the marker; keep `hasUnseenMenuNumbers` for MenuNumbersSection).
- One marker component `<span className="change-mark" title="Има промени од парот">!</span>` shown on events with `unseenSections.length > 0` in the events list, dashboard cards and calendar entries; the existing `Нови бројки` hint stays in the list when `menu_numbers` is among them.
- Настани nav item shows a count badge (number of events with unseen sections) passed from `app/venue/layout.tsx` (server, `venue_unseen_change_sections` for `access.venue.id`) → `PanelShell` → `VenueNav` as `badges?: Partial<Record<string, number>>` keyed by href.
- [ ] Steps: failing tests, implement, PASS.

### Task 9: Venue Известувања — kinds, colours, Видено, no RSVPs

**Files:**
- Modify: `lib/venue/notifications.ts`, `components/venue/dashboard/NotificationsList.tsx`, `app/venue/notifications/page.tsx`, `app/venue/panel.css`
- Create: `components/venue/dashboard/NotificationSeenButton.tsx` (client), `lib/notification-colors.ts` (pure: kind → colour + legend label, shared by both sides)
- Test: `tests/supabase/venue_notifications.test.ts` (update), `tests/lib/pure/notification-colors.test.ts`, `tests/components/venue/dashboard/NotificationsList.test.tsx`

**Behaviour:**
- Remove `public_rsvp` from `ACTIONS`/labels (`rsvp_changed` kind removed).
- New kinds: `couple_change` (from `event_changes` side couple, via service-role read scoped to the venue's events — the page uses the service-role client after `getCurrentVenueId`), `menu_numbers` (from `event_menu_submissions`, source couple/auto). Detail for contact is always redacted (`Контакт е променет`); guest count shows `old → new`.
- Each item: `color: "yellow"|"green"|"blue"|"grey"|"red"`, `unseen: boolean` (couple_change: per section seen; menu_numbers: `seen_at is null` and is the latest), `seenAction?: { eventId; section: "guest_count"|"contact"|"menu_numbers"; upTo: string; submissionId?: string }`.
- Colours: couple_change yellow, menu_numbers green, event_created/event_deleted blue, credentials_created/password_regenerated grey, data_erased/data_exported red.
- List: legend at top (5 chips; clicking filters by colour via `?color=`), coloured left border per item, `Не е видено` sign on unseen items, `NotificationSeenButton` (manager only, uses `markChangesSeenViaApi` or `markMenuNumbersSeenViaApi`; refreshes with `router.refresh()`).
- [ ] Steps: failing tests (no RSVP items; couple change item yellow + unseen + clears after seen; numbers item green; legend filter; button hidden without manager), implement, PASS.

### Task 10: Couple screens — boxes, dots, guest "Ново", reminder banner

**Files:**
- Create: `components/couple/ChangeNotice.tsx` (client box with Видено via POST `/api/couple/changes/seen`)
- Modify: `app/couple/(protected)/page.tsx` (S1, S2, S4, S5 boxes above the hero/contact), `app/couple/(protected)/menu/page.tsx` (S3 + venue-entered numbers box), `app/couple/(protected)/budget/page.tsx` (S6), `components/couple/shell/nav.ts`, `CoupleShell.tsx`, `app/couple/(protected)/layout.tsx` (dot flags + Известувања item), `app/couple/(protected)/guests/page.tsx`, `components/couple/GuestsClient.tsx`, `components/couple/guests/MenuNumbersSend.tsx` (banner)
- Test: `tests/components/couple/ChangeNotice.test.tsx`, extend `tests/components/couple/GuestsClient*.test.tsx`, `tests/components/couple/shell*.test.tsx` (create if missing)

**Behaviour:**
- Server pages load unseen changes with `listEventChanges` + `getSeen` + `getCoupleFirstLogin` + `unseenChanges(…, "couple", …)` and pass them to `ChangeNotice` per section (title = section label, lines `{dd.mm.yyyy HH:mm} · {describeChange}`, `Видено`).
- Мени page: S3 notice; if a `source='venue'` submission is unseen, a notice `Внесено од салата` with the numbers and Видено (`menu_numbers`).
- Nav dots (`dot?: boolean` on `CoupleNavItem`): Мени (S3 or venue numbers), Гости (unseen guest replies), Буџет (S6), Известувања (anything unseen). Computed in layout.
- Гости: rows with a reply newer than `seen.guest_replies` get badge `Ново`; filter toggle `Само нови`; button `Означи ги како видени` (POST seen `guest_replies` with the newest reply time).
- Banner `Испратете ги конечните бројки до салата` in MenuNumbersSend when stage is `couple_reminder` or `venue_can_remind` and nothing sent (stage from GET `/api/couple/menu-numbers`, extended with `stage`).
- [ ] Steps: failing tests, implement, PASS.

### Task 11: Couple Известувања page

**Files:**
- Create: `app/couple/(protected)/notifications/page.tsx`, `components/couple/CoupleNotificationsList.tsx`
- Modify: `components/couple/shell/nav.ts` (item, group planning, first in group), `lib/notification-colors.ts` (couple kinds)
- Test: `tests/components/couple/CoupleNotificationsList.test.tsx`

**Behaviour:** server page calls `listCoupleNotifications(eventId)`; list grouped by day like the venue list; legend (yellow/green/blue, filter `?color=`); venue_change items unseen show `Не е видено` + `Видено` (POST couple seen for that section with the item's time); guest replies unseen show `Ново`; reminders plain.
- [ ] Steps: failing tests, implement, PASS.

### Task 12: End-to-end, docs, full checks

**Files:**
- Create: `e2e/change-marks.spec.ts`
- Modify: `docs/production/DATA-MAP.md` (event_changes, event_change_seen, event_couple_reminders, couple_first_login_at, submissions source/unanswered), `docs/production/SECURITY-REVIEW.md` (staff redaction note)

- [ ] E2E: venue creates event (helper), couple logs in once; venue (manager) changes the date and removes nothing else → couple sees `Датум и време` notice on Почетна and the Известувања item, presses Видено → gone. Couple changes guest count → venue events list shows `!`, Настани badge `1`, event window ChangeBox, manager presses Видено → gone. Auto-send: set the event date via `admin` to today+15 and `created_at` to 30 days ago, call `runMenuAutoSend` through the cron route with `CRON_SECRET` (or directly via admin RPC if the route is not reachable in e2e) → venue sees `Испратено автоматски — непотполно`.
- [ ] Full checks: `npm run lint`, `npm run typecheck`, `npm run test:unit:coverage` (thresholds hold), build under node 22, `npm audit --omit=dev --audit-level=high`, migration prefixes unique, `npx supabase db lint --local …`, `npm run test:db:coverage`, `npm run test:e2e` → all green.
