# Event Menus and Guests' Menu Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Events get one or more menus (venue packages plus an optional manager-built custom menu) that only managers change. Couples see them read-only. Guests pick per person in the RSVP. The couple sends per-menu numbers to the venue as snapshots, and the venue acknowledges new numbers with Видено.

**Architecture:**
- `event_menu_templates` (0115) becomes the only menu link; custom menus are `menu_templates` rows with `event_id` set.
- New tables `event_guest_menu_counts` (per guest, per menu, count) and `event_menu_submissions` (sent snapshots).
- Old single-menu, couple-picker and quantities machinery is removed in a final task, so every earlier task stays green on its own.

**Tech Stack:** Next.js 16 (App Router), Supabase Postgres + RLS, zod, Vitest (unit `vitest.config.ts`, DB `vitest.db.config.ts`), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-event-menus-and-guest-choices-design.md` (decisions M1–M14).

## Global Constraints

- **UI copy:** every user-facing string is Macedonian. Errors reaching users are plain `throw new Error("…")` (SEC-003, `isUserFacingError`). Never pass raw DB or Supabase text through.
- **Migrations:** they start at `0119` and must be unique (CI checks the prefixes). Apply each with `npx supabase migration up --local`. Every new table gets RLS enabled, and grants are explicit.
- **Venue writes:** go through API routes with `requireManagerElevation` (or `requireManagerForEvent` in `lib/venue/event-guard.ts`), writing with `createServiceRoleClient()` scoped by `venue_id`. 403 body: `"Потребна е најава како менаџер."`
- **Couple writes:** `withCoupleEvent` routes plus the service role. A co-organizer is identified by `organizerSide(request) !== null` (`lib/couple/organizer-side.ts`).
- **Plan gating:** `custom_menu` stays a plan feature (event scope). Check it with `eventHasFeature(eventId, "custom_menu")` (`lib/entitlements/server.ts`). Locked answer: `{ error: LOCKED_MESSAGE }`, status 403.
- **Data:** the database is emptied before launch, so there is no data migration, but migrations must apply cleanly on the current schema.
- **Commits:** the user approves every commit. Each "Commit" step means stage the files, show the message, and wait for the go-ahead.
- **Done per task:** `npm run lint` (0 warnings), `npm run typecheck`, the task's tests, plus `npm run test:unit` / `npm run test:db` for the touched area.

## Review Focus

1. **A guest's party size changes after their menu counts were set.** The counts no longer add up, so the guest becomes "not done": shown as missing a menu, and blocking the send. → Task 7 test `guest whose party size changed is not done`.
2. **An event goes from 1 menu to 2 after guests confirmed.** Those guests have no counts and must become "not done" instead of silently counting toward the old single menu. → Task 7 test `adding a second menu makes earlier confirmations not done`.
3. **A menu is removed from the event after numbers were sent.** The latest snapshot still shows it by its stored title. Current numbers drop it, and the couple sees "Има промени…". → Task 9 test `removing a menu after sending is a change and keeps the old snapshot titles`.
4. **An event with no menus at all.** The RSVP asks nothing, and sending is refused with `"Салата сè уште нема поставено мени."` → Task 9 test `refuses to send without menus`.
5. **A co-organizer, or a stale tab, tries to send.** A co-organizer is refused with `"Само главната најава на младенците може да ги испрати бројките."`. "Not done" is always recomputed on the server at send time, not trusted from the client. → Task 9 tests `co-organizer cannot send` and `send recomputes not-done server-side`.

---

### Task 1: Schema for event-only menus, guest menu counts and submissions

**Files:**
- Create: `supabase/migrations/0119_event_menus_guest_counts.sql`
- Modify: `tests/supabase/privacy-classification.ts`
- Test: `tests/supabase/event_menus_schema.test.ts`

**Interfaces:**
- Produces:
  - `menu_templates.event_id uuid null references events(id) on delete cascade`, plus an index.
  - `event_guest_menu_counts(guest_id uuid → event_guests on delete cascade, menu_template_id uuid → menu_templates on delete cascade, count int check (count > 0), primary key (guest_id, menu_template_id))`.
  - `event_menu_submissions(id uuid pk default gen_random_uuid(), event_id uuid → events on delete cascade, sent_at timestamptz not null default now(), sent_by text not null, counts jsonb not null, menu_titles jsonb not null, total int not null, seen_at timestamptz, seen_by text)`, plus an index on `(event_id, sent_at desc)`.

- [ ] **Step 1: Write the failing tests** in `tests/supabase/event_menus_schema.test.ts` (fixture: two venues, a staff login for venue A, events, a guest):
  - `staff cannot create or edit an event-only menu directly`: a staff session's insert into `menu_templates` with `event_id` set fails, and its update of such a row affects 0 rows. Inserting/updating with `event_id` null still works.
  - `staff cannot change dishes of an event-only menu`: `setMenuTemplateItems(customId, [...], staff)` rejects. The same call on a standard template succeeds.
  - `a guest's count must be one of the event's menus`: an admin insert with a template not linked in `event_menu_templates` fails, and with a linked one succeeds.
  - `unlinking a menu from an event deletes guests' counts for it`: delete the `event_menu_templates` row, and the counts for that guest/template are gone.
  - `staff cannot read guest menu counts`: a staff select returns an error or 0 rows.
  - `staff read their own venue's submissions only, and cannot write them`: staff select sees A's row but not B's, and staff insert/update fails.
  - `event-only menu is deleted with its event`.
- [ ] **Step 2: Run** `npx vitest run -c vitest.db.config.ts tests/supabase/event_menus_schema.test.ts`. Expected: FAIL (missing column or tables).
- [ ] **Step 3: Write `0119_event_menus_guest_counts.sql`:**
  - Add the column and index.
  - Replace the policy "venue staff manage own menu templates" (0004) with a select-all-own policy plus insert/update/delete only `where event_id is null`.
  - Replace "venue staff manage own menu template items" (0019) the same way, by joining `menu_templates.event_id is null`.
  - Create both tables. Enable RLS. `event_guest_menu_counts`: no policies, `grant all to service_role`, nothing to `authenticated`. `event_menu_submissions`: select policy via `is_venue_staff_for(events.venue_id)`, `grant select to authenticated`, `grant all to service_role`.
  - Add a `before insert or update` trigger on `event_guest_menu_counts`: raise `23514` unless `exists (select 1 from event_menu_templates emt join event_guests g on g.event_id = emt.event_id where g.id = new.guest_id and emt.menu_template_id = new.menu_template_id)`.
  - Add an `after delete` trigger on `event_menu_templates` that deletes counts for `(guests of old.event_id, old.menu_template_id)`.
  - All functions use `set search_path = public, pg_temp`; revoke them from public, anon and authenticated.
- [ ] **Step 4: Classify the new columns** in `privacy-classification.ts`:
  - `menu_templates.event_id`: not personal;
  - `event_guest_menu_counts`: guest-linked, exported and erased with the event;
  - `event_menu_submissions.sent_by`: personal, the organizer's display name.
- [ ] **Step 5: Run** the new test, `tests/supabase/privacy_guard.test.ts` and `tests/supabase/menu_template_items_atomic.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(db): event-only menus, guest menu counts, menu submissions`

### Task 2: Events carry a menu list (data layer, RPCs, routes)

**Files:**
- Create: `supabase/migrations/0120_event_full_menu_lists.sql`
- Create: `app/api/venue/events/[eventId]/menu-usage/route.ts`
- Modify: `lib/venue/events.ts` (`CreateEventInput` :249, `createEvent` :284, `UpdateEventInput` :358, `updateEvent` :405, `EventDetail` :52, `listEventsWithDetails`)
- Modify: `lib/api/schemas.ts` (`createEventBody` :429, `updateEventBody` :457)
- Modify: `lib/venue/menus.ts` (`countEventsUsingTemplate`)
- Test: `tests/lib/venue/events.test.ts`, `tests/supabase/venue_events_routes.test.ts`

**Interfaces:**
- Consumes: Task 1 tables.
- Produces:
  - `type EventMenu = { id: string; name: string; isCustom: boolean; items: { id: string; name: string; course: string; photo_path: string | null }[] }`.
  - `EventDetail.menus: EventMenu[]`, which replaces `menu_template_id` and `customMenuItems`.
  - `CreateEventInput.menu_template_ids: string[]` and `UpdateEventInput.menu_template_ids: string[]`. The scalar `menu_template_id` is gone from both.
  - Route `GET /api/venue/events/[eventId]/menu-usage` (manager) returns `{ usage: Record<menuTemplateId, number> }`, the number of guests with a count for each menu.
  - RPCs: `create_event_full(…, p_menu_template_ids uuid[])` with the scalar parameter removed, and `update_event_full(…, p_room_ids uuid[], p_menu_template_ids uuid[])`.

- [ ] **Step 1: Write the failing tests:**
  - `createEvent links every chosen menu`: with `menu_template_ids: [a, b]`, `event_menu_templates` has both rows.
  - `updateEvent replaces the menu list`: `[a, b]` → `[b]` leaves the a-row deleted and the guest counts for a gone.
  - `refuses another venue's menu, and another event's custom menu`: message `"Едно или повеќе менија не припаѓаат на овој локал."`
  - `listEventsWithDetails returns menus with items, flags custom ones`.
  - Route test `menu-usage: manager gets per-menu guest counts, staff 403`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: `0120`.**
  - Drop and recreate both RPCs with the new parameter lists. Keep their existing body logic and their `service_role`-only grants.
  - `update_event_full` deletes the `event_menu_templates` rows not in the list and inserts the missing ones in the same transaction.
  - For now both RPCs still set `events.menu_template_id = p_menu_template_ids[1]`, so the readers Task 11 removes keep working.
- [ ] **Step 4: Update `lib/venue/events.ts`, the schemas and the route.**
  - Allowed ids are the venue's templates whose `event_id` is null or equals this event.
  - Schema: `menu_template_ids: z.array(uuid).max(20)`.
  - `countEventsUsingTemplate` reads only `event_menu_templates`.
- [ ] **Step 5: Run** the tests plus `tests/supabase/venue_events_routes.test.ts`, `tests/supabase/event_private_details.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(venue): events have a list of menus`

### Task 3: Event window, Настани list and wizard use the menu list

**Files:**
- Modify: `components/venue/dashboard/EventEditForm.tsx` (menu field :477-497, payload :258, MenuDetailModal :801)
- Modify: `components/venue/dashboard/EventsClient.tsx` (:247-251, :308-326, :384-391)
- Modify: `components/venue/events/NewEventWizard.tsx` (:184-185)
- Modify: `components/venue/dashboard/ClientsClient.tsx` (props only)
- Create: `lib/venue/menu-usage-client.ts`, which exports `fetchMenuUsage(eventId: string, token: string | null): Promise<Record<string, number>>` and calls `reportElevationRejected()` on a 403.
- Test: `tests/components/venue/dashboard/EventEditForm.test.tsx`, `tests/components/venue/dashboard/EventsDeepLink.test.tsx`, `tests/components/venue/events/NewEventWizard.test.tsx`

**Interfaces:**
- Consumes: `EventDetail.menus`, `updateEventViaApi` with `menu_template_ids`.

- [ ] **Step 1: Write the failing tests:**
  - `shows every menu as a chip with Погледни мени`.
  - `a manager adds and removes menus and saves menu_template_ids`.
  - `removing a menu guests chose warns "3 гости го избрале ова мени — нивниот избор ќе се избрише"` (with `fetchMenuUsage` mocked).
  - `plain staff see menus read-only`.
  - `Настани list shows all menu names or "Без мени"`.
  - `wizard sends menu_template_ids only`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Replace the `<select id="edit-menu-template">` with toggle chips for the standard packages (from `menuTemplates`), plus any custom menu already on the event. Show the warning inline before save. Leave the rest of the form untouched.
- [ ] **Step 4: Run** the component tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(venue): pick several menus in the event window`

### Task 4: Manager-built custom menu for an event

**Files:**
- Create: `lib/venue/event-custom-menu.ts` (server-only)
- Create: `app/api/venue/events/[eventId]/custom-menu/route.ts` (PUT)
- Create: `lib/venue/custom-menu-client.ts`
- Modify: `components/venue/dashboard/PackageBuilder.tsx`, which gains an optional `onSave` prop and `allowDelete`
- Modify: `components/venue/dashboard/EventEditForm.tsx`, adding a "+ Сопствено мени" / "Уреди сопствено мени" button
- Test: `tests/supabase/event_custom_menu.test.ts`, `tests/components/venue/dashboard/PackageBuilder.test.tsx`

**Interfaces:**
- Produces:
  - `saveEventCustomMenu(client: SupabaseClient, venueId: string, eventId: string, input: { name: string; itemIds: string[] }): Promise<{ id: string }>`. Creates the event's custom menu (one per event) or updates it, sets its dishes with `setMenuTemplateItems`, and links it in `event_menu_templates` if new.
  - Route `PUT /api/venue/events/[eventId]/custom-menu`, body `{ name: string (1..200, trimmed), item_ids: uuid[] (max 200) }`. It requires the manager login, then checks `eventHasFeature(eventId, "custom_menu")`; without the feature it returns 403 `LOCKED_MESSAGE`.
  - `saveCustomMenuViaApi(eventId: string, input: { name: string; itemIds: string[] }, token: string | null): Promise<{ id: string }>`.
  - `PackageBuilder` props add `onSave?: (input: { name: string; description: string | null; itemIds: string[] }) => Promise<void>` (used instead of create/update when given) and `allowDelete?: boolean` (default true).

- [ ] **Step 1: Write the failing tests:**
  - `manager builds a custom menu; it is linked to the event and offered nowhere else` (`listMenuTemplatesWithItems` doesn't return it).
  - `second save updates the same menu`.
  - `refused without the custom_menu feature`: 403 with `LOCKED_MESSAGE`.
  - `plain staff 403`.
  - `dishes from another venue are refused`.
  - PackageBuilder: `onSave replaces the default save and hides delete when allowDelete=false`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `listMenuTemplatesWithItems` and `listMenuTemplates` filter `event_id is null`.
  - The custom menu's default name is `"Сопствено мени"`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(venue): managers build an event's custom menu`

### Task 5: Мени / Пакети — custom menus section, Поминати, delete and copy

**Files:**
- Modify: `lib/venue/menus.ts`, adding `listEventCustomMenus`
- Modify: `lib/venue/event-custom-menu.ts`, adding `deletePastCustomMenu` and `copyCustomMenuToPackage`
- Create: `app/api/venue/menus/custom/[templateId]/route.ts` (DELETE)
- Create: `app/api/venue/menus/custom/[templateId]/copy/route.ts` (POST)
- Modify: `lib/venue/custom-menu-client.ts`, adding `deleteCustomMenuViaApi` and `copyCustomMenuViaApi`
- Modify: `components/venue/dashboard/MenusClient.tsx` and `app/venue/menus/page.tsx`
- Create: `components/venue/dashboard/EventCustomMenusSection.tsx`
- Test: `tests/supabase/event_custom_menu.test.ts` (extend), `tests/components/venue/dashboard/EventCustomMenusSection.test.tsx`

**Interfaces:**
- Produces:
  - `type EventCustomMenu = MenuTemplate & { items: MenuItem[]; event: { id: string; couple_names: string; event_date: string }; latestCount: number | null }`.
  - `listEventCustomMenus(venueId: string, client?: SupabaseClient): Promise<EventCustomMenu[]>`, sorted by `event_date` ascending. `latestCount` is the menu's count in the event's newest `event_menu_submissions` row; staff can read those (Task 1).
  - `deletePastCustomMenu(client, venueId, templateId): Promise<void>`. It throws `"Може да се избрише само сопствено мени од поминат настан."` when the event date is today or later.
  - `copyCustomMenuToPackage(client, venueId, templateId): Promise<{ id: string }>`. It creates a standard template with the same name and dishes.
  - Both routes are manager-only.

- [ ] **Step 1: Write the failing tests:**
  - `lists custom menus with event, dishes and latest sent count`.
  - `deleting is refused for an upcoming event and allowed for a past one`.
  - `deleting keeps the event's submissions and their stored title`.
  - `copy creates a standard package with the same dishes`.
  - `staff 403 on delete/copy`.
  - Component:
    - `upcoming first; past folded under "Поминати"`;
    - `staff see no Избриши/Уреди/Направи стандарден пакет; managers do`;
    - `Избриши only on past cards, behind a confirm`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The packages tab shows "Стандардни пакети" (existing UI) followed by `EventCustomMenusSection`. Editing a custom menu reuses PackageBuilder through `onSave` → `saveCustomMenuViaApi`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(venue): custom menus section in Мени / Пакети`

### Task 6: Couple's Мени page becomes view-only

**Files:**
- Modify: `lib/couple/menu.ts`. Replace everything with `getEventMenus`.
- Delete: `components/couple/MenuPicker.tsx`, `app/api/couple/menu/route.ts`, `app/api/couple/menu/quantities/route.ts` and their tests (`tests/components/couple/MenuPicker.test.tsx`, plus the menu cases in `tests/lib/api/{route-validation,schemas,feature-gate,menu-filter-guard}.test.ts`)
- Remove from `lib/api/schemas.ts`: `menuSelectionBody`, `menuQuantitiesBody`
- Create: `components/couple/EventMenusView.tsx`
- Modify: `app/couple/(protected)/menu/page.tsx`
- Modify: `lib/couple/dashboard.ts`, replacing `menuStatus` with `menus: string[]`
- Test: `tests/lib/couple/menu.test.ts` (rewrite), `tests/components/couple/EventMenusView.test.tsx`, `tests/lib/couple/dashboard.test.ts`

**Interfaces:**
- Produces:
  - `type CoupleEventMenu = { id: string; name: string; isCustom: boolean; dishes: ProgramDish[] }`.
  - `getEventMenus(eventId: string): Promise<CoupleEventMenu[]>`, using the service role, with dishes sorted by `sortDishes`.
  - `EventMenusView` props: `{ menus: CoupleEventMenu[]; totals?: { id: string; count: number }[] }`.

- [ ] **Step 1: Write the failing tests:**
  - `getEventMenus returns the event's menus with sorted dishes, custom included`.
  - `view shows each menu's title and dishes, no edit controls`.
  - `no menus: "Салата сè уште нема поставено мени."`.
  - Dashboard: `menus lists titles`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Totals are wired in Task 7. Here, pass `totals` only when present.
- [ ] **Step 4: Run** `npm run test:unit` and the couple DB tests. Expected: PASS, with no reference left to the deleted routes.
- [ ] **Step 5: Commit** `feat(couple): Мени page is view-only`

### Task 7: Guests' menu counts in the guest list

**Files:**
- Create: `lib/couple/guest-menus.ts`
- Modify: `lib/couple/guests.ts` (`Guest` :10, `GUEST_COLUMNS` :66, `GuestStats` :42, `getGuestStats` :187)
- Modify: `lib/api/schemas.ts` (`guestUpdateBody` :206), adding `{ type: "menus", counts: z.record(uuid, z.number().int().min(1).max(PARTY_SIZE_MAX)) }`
- Modify: `app/api/couple/guests/[id]/route.ts`
- Modify: `components/couple/guests/GuestDetail.tsx`, `components/couple/GuestsClient.tsx`, `components/couple/guests/GuestsSummary.tsx`, `lib/couple/guest-csv.ts`, `lib/couple/guest-labels.ts`
- Test: `tests/lib/pure/guest-menus.test.ts`, `tests/lib/couple/guests.test.ts`, `tests/components/couple/GuestsClient.test.tsx`

**Interfaces:**
- Produces:
  - `type MenuCounts = Record<string, number>`.
  - `validateMenuCounts(menuIds: string[], partySize: number, counts: MenuCounts): { ok: true; counts: MenuCounts } | { ok: false; error: string }`. This is pure. With 0 or 1 menus it returns `{ ok: true, counts: {} }`. Unknown ids give `"Непознато мени."`. A wrong sum gives `` `Изберете мени за сите ${partySize} лица.` ``.
  - `isGuestDone(guest: { rsvp_status: string; party_size: number; menu_counts: MenuCounts }, menuIds: string[]): boolean`. It is true for `declined`, and true for `confirmed` when `menuIds.length <= 1` or the counts sum to `party_size` and only use `menuIds`. It is false otherwise.
  - `setGuestMenuCounts(eventId: string, guestId: string, counts: MenuCounts): Promise<void>` (service role; replaces the guest's rows).
  - `Guest.menu_counts: MenuCounts` (replaces `menu_choice`).
  - `GuestStats.menus: { id: string; name: string; count: number }[]` and `GuestStats.notDone: { id: string; full_name: string }[]` (replace `menu`). Totals: with one menu, every confirmed guest's `party_size` counts toward it; with 2+ menus, the counts are summed.

- [ ] **Step 1: Write the failing tests:**
  - pure: `sum must equal party size`, `unknown menu refused`, `single menu needs no counts`.
  - `guest whose party size changed is not done`.
  - `adding a second menu makes earlier confirmations not done`.
  - `declined guests are done and never counted`.
  - `stats totals per menu and lists not-done guests by name`.
  - Route: `couple sets a guest's counts; wrong sum is a 400 with the Macedonian message; co-organizer limited to own side` (existing side rule).
  - UI: `guest row shows "Класично 3 · Посно 1" or "Нема избрано мени"`, `GuestDetail edits counts only when 2+ menus`, `summary shows totals and "Уште N гости немаат конечен одговор"`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** In the CSV export, replace the single menu column with one column per menu name.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(couple): guests' menu counts in the guest list`

### Task 8: RSVP, invitation and reminder use the event's menus

**Files:**
- Modify: `lib/couple/rsvp.ts` (`RsvpInput` :17, `Invitee` :39, `getInviteeByToken` :57, `submitRsvpBySlug` :105)
- Modify: `lib/api/schemas.ts` (`rsvpBody` :510; replace `menu_choice` :526 with `menu_counts`; remove `MENU_CHOICES`)
- Modify: `app/api/invite/[slug]/rsvp/route.ts`
- Modify: `components/invite/RsvpForm.tsx` (drop `MENUS` :13; new per-menu inputs)
- Modify: `lib/couple/invitations.ts` (`PublicInvitation.menu` :155 → `menus`; :174-208) and `components/invite/FullInvitation.tsx` (:218, :407-412)
- Modify: `lib/couple/invite-share.ts` (`reminderMessage` :35, last line)
- Test: `tests/lib/couple/rsvp.test.ts`, `tests/components/invite/RsvpForm.test.tsx`, `tests/components/invite/FullInvitation.test.tsx`, `tests/lib/couple/invitations.test.ts`, `tests/lib/couple/reminders.test.ts`

**Interfaces:**
- Consumes: `validateMenuCounts`, `setGuestMenuCounts`, `getEventMenus`.
- Produces:
  - `RsvpInput.menuCounts?: MenuCounts` (replaces `menuChoice`).
  - `Invitee.menuCounts: MenuCounts`.
  - `PublicInvitation.menus: { id: string; name: string; dishes: ProgramDish[] }[]`.
  - `RsvpForm` prop `menus: { id: string; name: string }[]`.
  - The reminder's last line becomes `` `Потврдете доаѓање и изберете мени: ${link}` ``.

- [ ] **Step 1: Write the failing tests:**
  - `2+ menus: confirmed without complete counts is refused with "Изберете мени за сите N лица."`.
  - `2+ menus: counts stored`.
  - `1 menu: no counts stored, confirmed accepted`.
  - `declined/later: counts cleared`.
  - Form: `no menu question with 0–1 menus`, `one number per menu with 2+, must add up`.
  - Invitation: `lists each menu with its dishes`.
  - Reminder: `last line asks to choose the menu`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Both RSVP paths (personal token and name match) go through `submitRsvpBySlug`. The rule lives only there.
- [ ] **Step 4: Run** the tests plus `e2e/invitation-rsvp.spec.ts` (update its menu step). Expected: PASS.
- [ ] **Step 5: Commit** `feat(rsvp): guests choose between the event's menus`

### Task 9: Couple sends the numbers (snapshot)

**Files:**
- Create: `lib/menu-numbers.ts` (pure, no server-only imports; used by both the couple and the venue): `MenuNumbers`, `MenuSubmission`, `diffMenuNumbers`
- Create: `lib/couple/menu-submissions.ts` (server)
- Create: `app/api/couple/menu-numbers/route.ts` (GET, POST)
- Modify: `components/couple/guests/GuestsSummary.tsx` (send states) and `components/couple/EventMenusView.tsx` (totals)
- Test: `tests/supabase/menu_submissions.test.ts`, `tests/components/couple/GuestsSummary.test.tsx`

**Interfaces:**
- Produces in `lib/menu-numbers.ts`: `MenuNumbers`, `MenuSubmission`, `diffMenuNumbers`. The rest goes in `lib/couple/menu-submissions.ts`.
  - `type MenuNumbers = { menus: { id: string; name: string; count: number }[]; total: number }`.
  - `type MenuSubmission = { id: string; sentAt: string; sentBy: string; numbers: MenuNumbers; seenAt: string | null; seenBy: string | null }`. `numbers` is rebuilt from `counts` plus `menu_titles`.
  - `currentMenuNumbers(eventId: string): Promise<{ numbers: MenuNumbers; notDone: { id: string; full_name: string }[] }>`.
  - `listMenuSubmissions(eventId: string, limit = 2): Promise<MenuSubmission[]>`, newest first.
  - `diffMenuNumbers(prev: MenuNumbers, next: MenuNumbers): { name: string; from: number; to: number }[]`, by menu id. A menu present in only one side counts as 0 on the other.
  - `sendMenuNumbers(eventId: string): Promise<MenuSubmission>`. It recomputes everything on the server.
    - It throws `"Салата сè уште нема поставено мени."` with 0 menus.
    - It throws `` `Уште ${n} гости немаат конечен одговор.` `` when any guest isn't done.
    - It stores `sent_by = "Младенците"`.
  - `GET /api/couple/menu-numbers` returns `{ current, notDone, latest: MenuSubmission | null, changedSinceLatest: boolean }`.
  - `POST /api/couple/menu-numbers` returns 403 with `"Само главната најава на младенците може да ги испрати бројките."` when `organizerSide(request) !== null`.

- [ ] **Step 1: Write the failing tests** (Review Focus 3–5):
  - `refuses to send without menus`.
  - `send recomputes not-done server-side`: a guest set to `later` after the page loaded blocks the send.
  - `co-organizer cannot send`.
  - `snapshot stores counts and titles; later guest edits don't change it`.
  - `changedSinceLatest after a guest declines`.
  - `removing a menu after sending is a change and keeps the old snapshot titles`.
  - `diff lists only changed menus`.
  - UI:
    - `send disabled with the not-done names`;
    - `enabled when everyone is done, confirm shows numbers`;
    - `after sending: "Испратено на …"`;
    - `with changes: "Има промени од последното испраќање: Посно +1" and "Испрати ажурирани бројки"`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(couple): send menu numbers to the venue`

### Task 10: Venue sees the numbers, with Видено

**Files:**
- Modify: `lib/venue/events.ts`. `EventDetail` gains `menuNumbers: { latest: MenuSubmission | null; previous: MenuSubmission | null }`, embedded from `event_menu_submissions` (newest two, staff RLS read).
- Create: `app/api/venue/events/[eventId]/menu-numbers/seen/route.ts` (POST, manager). It sets `seen_at = now()` and `seen_by = manager name` on the latest row.
- Create: `lib/venue/menu-numbers-client.ts` with `markMenuNumbersSeenViaApi(eventId: string, token: string | null): Promise<void>`
- Modify: `components/venue/dashboard/EventEditForm.tsx`, adding a "Бројки за мени" section
- Modify: `components/venue/dashboard/EventsClient.tsx`, adding a "Нови бројки" marker
- Test: `tests/supabase/menu_submissions.test.ts` (extend), `tests/components/venue/dashboard/EventEditForm.test.tsx`

**Interfaces:**
- Consumes: `MenuSubmission`, `diffMenuNumbers` from `lib/menu-numbers.ts` (Task 9).

- [ ] **Step 1: Write the failing tests:**
  - `before any sending: "Парот сè уште не ги испратил бројките."`.
  - `shows per-menu numbers, total and "Испратено на 14.06"`.
  - `unseen newer sending is highlighted with "Посно: 22 → 23" and Видено`.
  - `plain staff see the highlight but no Видено button`.
  - `Видено: manager 200 clears it; staff 403`.
  - `Настани shows "Нови бројки" only while unseen`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Follow §8 of the spec: everyone sees it, a manager confirms, and it clears only on Видено.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(venue): menu numbers on the event, with Видено`

### Task 11: Remove the old single-menu, couple-picker and quantities machinery

**Files:**
- Create: `supabase/migrations/0121_drop_single_menu_and_couple_picker.sql`
- Modify: `lib/venue/events.ts`, `lib/privacy/export.ts` (:31-32, :57-58, :82, :151, :162-163, :195, :219-220), `tests/supabase/privacy-classification.ts`, `supabase/seed.sql` (:102; seed `event_menu_templates` with two menus for the demo couple), `stories/fixtures.ts`, `docs/production/{DATA-MAP,SECURITY-REVIEW,ADMIN}.md`
- Modify or remove: every test listed under "dropped items" in the code survey that still references the dropped objects
- Test: `tests/supabase/event_menus_schema.test.ts` (extend)

**Interfaces:**
- Produces, in 0121:
  - Recreate `create_event_full` / `update_event_full` without writing `events.menu_template_id`.
  - Drop:
    - `events.menu_template_id` (update the 0045 trigger `assert_same_venue_references` so it no longer lists that column);
    - `event_custom_menu_items` and `event_menu_item_quantities`;
    - the RPCs `set_event_menu_template`, `set_event_menu_custom`, `replace_menu_item_quantities`;
    - `event_guests.menu_choice`.
  - Add a `before insert` trigger on `event_menu_templates`: the template's venue equals the event's venue, and `event_id` is null or equals the event.
  - Move `custom_menu` enforcement to `menu_templates` inserts with `event_id` set. This replaces the `'event_custom_menu_items'` case in the 0086 entitlement trigger.

- [ ] **Step 1: Write the failing tests:**
  - `a template from another venue cannot be linked to an event`.
  - `another event's custom menu cannot be linked`.
  - `custom menu insert refused at DB level when the event's plan lacks custom_menu`.
  - `dropped objects are gone` (a query against `information_schema` / `pg_proc` finds none).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Write 0121 and remove every reference.** Check that `grep -rnE "menu_template_id|event_custom_menu_items|event_menu_item_quantities|menu_choice|set_event_menu_(template|custom)|replace_menu_item_quantities" app components lib tests e2e stories supabase/seed.sql` returns only `event_menu_templates.menu_template_id` / `event_guest_menu_counts.menu_template_id` usages.
- [ ] **Step 4: Run** `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:db`, and `npx supabase db lint --local --level warning --fail-on error`. Expected: all PASS.
- [ ] **Step 5: Commit** `refactor: remove single-menu and couple menu picker`

### Task 12: End-to-end flow

**Files:**
- Create: `e2e/event-menus.spec.ts`
- Modify: `e2e/helpers.ts`, adding `createEventWithMenus(page, account, menuNames: string[])`

- [ ] **Step 1: Write the test** `two menus → guest answers by RSVP → couple sets a guest by hand → sends → venue sees numbers and presses Видено`:
  - a manager creates an event with two packages through the wizard;
  - a guest answers through the invitation link with counts 1 + 1;
  - the couple marks a second guest as declined, then sends;
  - the manager sees the numbers in the event window and presses Видено, and the highlight is gone.
- [ ] **Step 2: Run** `npx playwright test e2e/event-menus.spec.ts`. Expected: PASS. Then run the full `npx playwright test`. Expected: all PASS.
- [ ] **Step 3: Commit** `test(e2e): event menus and guest numbers`
