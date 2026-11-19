# Data map and processor inventory

Task: **COMP-003**. Feeds **COMP-001** (privacy notice / lawful bases), **DATA-005** (data-subject requests, deletion) and **DATA-007** (retention).

Status: draft, written 29 Sep 2026 from the working tree on `main` (after commit `3de5d2a`). Derived by reading every migration `supabase/migrations/0001` to `0030` in order and the code paths that read or write each table. Only the **final** schema is listed. Columns that were added and later dropped are listed under "Historic" at the end of section 2.

Legend used below:

- **Lawful basis:** a hint only. Every entry is marked *to confirm in COMP-001*.
- **Retention:** no retention period is defined anywhere in the schema or the code today. Every entry says "none defined, see DATA-007" unless there is a mechanism.
- **Service role** means `createServiceRoleClient()` (`lib/supabase/service-role.ts`), which bypasses RLS. Couple-facing code gets `event_id` only from the `x-couple-event-id` header that `proxy.ts` injects after validating the `couple_session` cookie. It strips any header the client sends.

---

## 1. Data subjects

| Subject | Who | How they reach the system |
|---|---|---|
| **Venue staff** | Owner/employees of a venue (restaurant, hall) | Supabase Auth email + password, `/login`, `/venue/*`. Accounts are created by the team (admin panel → Нов локал); `/signup` only takes demo requests |
| **Venue (as a business)** | The venue itself. Personal data only if it trades under a person's name (sole trader) | Created by the team after a demo (admin panel → Нов локал → `provision_venue`; optional phone) |
| **Couple** (event organizer) | The client of the venue: bride/groom, or the organizer of a birthday, graduation etc. | One shared username/password per event, created by venue staff (`event_credentials`), `/couple/*` |
| **Guest** | Invited people on the couple's guest list, plus anyone who RSVPs via the link | No account. The invitation slug is the only credential, `/invite/[slug]`; greetings (text, optional video) are sent from the invitation |
| **Album uploader** | Any guest with the album link/QR code (`/e/[token]`) | No account. Uploads photos/videos after ticking the consent box; name optional (§2.12a) |
| **Support requester** | Venue staff (Панел → Поддршка) or a couple (`/couple` → Поддршка) | Their own session; tickets go to the platform admin inbox (§2.12b) |
| **Reservation customer** | Someone who books a table directly with the venue (not an event) | Never touches the app. Entered by venue staff |
| **Contact-form / demo-request sender** | A prospective venue customer writing through the marketing page or asking for a demo | Public forms on `/` (`POST /api/venue/contact`) and `/signup` (`POST /api/venue/demo`) |
| **Third parties named in free text** | Vendors (photographer, band), family members, and anyone else named in notes, budget lines, agenda, table labels | Typed in by couples or staff |

---

## 2. Personal data in Postgres (Supabase, `public` schema)

### 2.1 `venues`
Created in `0001_venues_rooms_tables.sql`. Column added in `0012_floor_plan_layers.sql`.

| Field | Personal? | Notes |
|---|---|---|
| `name` | Only for a sole trader | Business name, shown on public invitations (`getInvitationBySlug`) |
| `layout_lock_password_hash` | Credential (bcrypt) | Shared venue "layout lock" PIN. Default is `crypt('0000')`. Never selected by clients. Set/checked only via `set_venue_layout_password` / `verify_venue_layout_password` (SECURITY DEFINER, gated by `is_venue_staff_for`) |
| `rsvp_deadline_days` | No. Venue setting: guests can answer the invitation until this many days before the event (default 15) | 0180 |
| `deletion_scheduled_for`, `deletion_scheduled_by` | No. When the platform admin's scheduled deletion of the venue runs (now + 15 days), and that admin's user id. The daily retention cron deletes the venue once the date passes (`delete_scheduled_venue`); the venue panel shows the date and links to the data export | 0172 |

- **Subject:** venue as a business (staff for the PIN).
- **Purpose:** tenant identity, floor-plan edit lock.
- **Lawful basis:** contract with the venue (*to confirm in COMP-001*).
- **Access:** staff via RLS `"venue staff read own venue"` (0004) and `"venue staff update own venue"` (0009). Insert only through the service role in `provisionVenueForUser` (`/api/venue/signup`). The name is also shown publicly on invitation pages via the service role.
- **Retention:** none defined, see DATA-007. `on delete cascade` from `venues` removes all venue-owned rows: rooms, events, reservations, and through `events` everything couple- and guest-related.

### 2.2 `venue_staff`
Created in `0004_rls_policies.sql`. Self-read added in `0005_venue_staff_self_read.sql`.

| Field | Personal? | Notes |
|---|---|---|
| `user_id` | Yes (pseudonymous link to `auth.users`) | FK with `on delete cascade` |
| `venue_id` | Links a person to an employer | |

- **Subject:** venue staff.
- **Purpose:** authorization. `is_venue_staff_for(venue_id)` is used by nearly every RLS policy.
- **Lawful basis:** contract (*to confirm in COMP-001*).
- **Access:** staff read their own row only, via `"staff reads own staff row"` (0005). Writes are service-role only (`lib/venue/provisioning.ts`). No update/delete grant is given to `authenticated`.
- **Retention:** none defined, see DATA-007. Deleting the auth user cascades this row, but the **venue and all its data stay behind, orphaned** (see Open questions).

### 2.3 `events`
Created in `0003_events_couples.sql`, then changed by `0010` (dropped `couple_user_id`), `0012` (`layout_undo_snapshot`), `0013` (contact fields), `0014` (schedule/status/type), `0020` (seating draft), `0021` (finance) and `0024` (`checklist_seeded_at`).

| Field | Personal? | Added in |
|---|---|---|
| `couple_names` | Yes. Names of the couple/organizers | 0003 |
| `event_date`, `start_time`, `end_time` | Yes, in context (the date of a person's wedding) | 0003, 0014 |
| `event_type` | Yes, in context (wedding, baptism, birthday reveal life events) | 0014 |
| `status` | Low | 0014 |
| `guest_count_estimate` | Low | 0003 |
| `contact_email`, `contact_email_2`, `contact_phone` | **Yes. Direct contact data** | 0013 |
| `total_price`, `deposit_paid` | **Yes. Financial data about the couple** (manual record, no payments processed) | 0021 |
| `price_per_guest`, `contracted_guests` | **Yes. Financial data about the couple**, like `total_price`: the per-guest price and guest count the total was agreed on (set by the venue's price calculator; null for a total typed by hand). Private like `total_price` (not in 0117's staff grant; read via `/api/venue/events/private`, written via the manager-gated finance route). Kept on erasure | 0182 |
| `seating_draft`, `seating_draft_undo`, `seating_confirmed_at`, `layout_undo_snapshot` | Incidental. JSON copies of layout elements including free-text `label` (may hold guest names) | 0020, 0012 |
| `checklist_seeded_at` | No | 0024 |
| `personal_data_erased_at` | No. Set by the event erasure (DATA-005) | 0043 |
| `rsvp_deadline` | Yes, in context (a planning date, like `event_date`). The venue's own answer deadline for this event; null follows `venues.rsvp_deadline_days`. Kept on erasure | 0180 |
| `couple_access_until`, `couple_access_extended_until` | No. Couple-access end dates: set by cancelling the event (status trigger) / by the platform admin. The retention sweep erases the event after `coalesce(extended, until, event_date + 6 months)` | 0170 |

- **Subject:** couple (and, through labels, possibly guests).
- **Purpose:** managing the booking and event (contract with the couple), contacting the couple, keeping payment records.
- **Lawful basis:** contract / pre-contract steps between venue and couple. Financial records may fall under a legal obligation (accounting) (*to confirm in COMP-001*).
- **Access:**
  - Venue staff via RLS `"venue staff reads own events"` (0096): read-only, and since **0117** without `contact_email`, `contact_email_2`, `contact_phone`, `total_price`, `deposit_paid` (column-level grant). Those five are read only server-side with the service role, behind a manager-elevation check (`/api/venue/events/private`, `/api/venue/clients`, `/api/venue/reports`); every event write goes through manager-gated routes (0096).
  - Couples via the service role, scoped `.eq("id", eventId)`: `app/api/couple/contact-info/route.ts` updates the contact fields, and `lib/couple/dashboard.ts` / `lib/couple/seating.ts` handle the rest.
  - Guests (public): only `couple_names`, `event_date`, `start_time`, plus venue and room names, via `getInvitationBySlug` (`lib/couple/invitations.ts`, service role).
- **Retention:** none defined, see DATA-007.

### 2.4 `event_credentials`
Created in `0013_couple_dashboard.sql`.

| Field | Personal? | Notes |
|---|---|---|
| `username` | Yes (chosen by staff, often derived from names) | unique |
| `password_hash` | Credential (bcrypt via pgcrypto) | |
| `failed_attempts`, `locked_until` | Security metadata | Lockout after 5 failures for 15 min (`verify_event_credentials`) |
| `created_at` | Low | |

- **Subject:** couple.
- **Purpose:** couple authentication.
- **Lawful basis:** contract (*to confirm in COMP-001*).
- **Access:** RLS is enabled with **no policies**, and the table is granted to `service_role` only. Staff read `username` only through `get_event_username()` and set passwords via `create_event_credentials` / `regenerate_event_password`. All of these are SECURITY DEFINER, check `is_venue_staff_for`, and are granted to `authenticated`. Login uses `verify_event_credentials` (service role only) from `app/api/couple/login/route.ts`.
- **Retention:** none defined, see DATA-007. Cascades with the event.

### 2.4a `event_co_organizers`
Created in `0061_co_organizers.sql` (A12): one extra login per side of the family (bride's / groom's).

| Field | Personal? | Notes |
|---|---|---|
| `username` | Yes (chosen by the couple, often a name) | unique across this table and `event_credentials` |
| `side` | Yes (family relationship) | bride / groom; one login per side |
| `password_hash` | Credential (bcrypt via pgcrypto) | never exported |
| `failed_attempts`, `locked_until` | Security metadata | Lockout after 5 failures for 15 min (`verify_couple_login`) |
| `created_at` | Low | |

- **Subject:** a relative or friend helping the couple.
- **Purpose:** letting each side send its own invitations.
- **Access:** service role only, no policies. The couple's own login manages them (`/api/couple/co-organizers`, refused for a co-organizer's session). Login via `verify_couple_login`; `proxy.ts` passes the side as `x-couple-organizer-side`.
- **Retention:** cascades with the event; deleted when the event's personal data is erased (trigger `events_erase_co_organizers`). Exported without the hash.

### 2.5 `couple_sessions`
Created in `0013_couple_dashboard.sql`.

| Field | Personal? | Notes |
|---|---|---|
| `token` | Session secret (online identifier) | 32 random bytes, hex (`lib/couple/session-token.ts`). Only its **SHA-256 hash** is stored (migration 0032, SEC-008); the raw value exists only in the cookie |
| `event_id`, `created_at`, `expires_at` | Links the session to a couple | 30-day sliding expiry (`lib/couple/session-verify.ts`) |
| `organizer_id` | Links the session to a co-organizer (null for the couple's own login) | 0061; cascades when the co-organizer is removed |

- **Subject:** couple.
- **Purpose:** keeping the couple logged in.
- **Lawful basis:** contract / strictly necessary (*to confirm in COMP-001*).
- **Access:** service role only. `proxy.ts` goes through `lib/couple/session-verify.ts`. No policies.
- **Retention:** rows are deleted on logout only. **Expired rows are never purged.** Needs a cleanup job, see DATA-007.

### 2.6 `event_guests`
Created in `0022_organizer_tools.sql`. `side` added in `0025_guest_side.sql`; RSVP and invite fields in `0060_guest_invites_and_rsvp_fields.sql`.

| Field | Personal? | Notes |
|---|---|---|
| `full_name` | **Yes** | |
| `phone` | **Yes** | optional |
| `email` | **Yes** | optional, for invitations and reminders (0060) |
| `party_size` | Yes, in context | |
| `children_count` | Yes, in context | 0060 |
| `rsvp_status` | Yes (attendance) | invited / confirmed / declined / pending / later |
| `side` | Yes (family relationship: bride's or groom's side) | 0025 |
| `allergies` | **Yes. Special-category (health) data** | ≤ 300 chars, set by the guest in the RSVP (0060) |
| `rsvp_comment` | Free text, like `notes` | ≤ 500 chars, set by the guest (0060) |
| `invite_token` | **Secret** | opens this guest's personal invitation/RSVP; never exported (0060) |
| `invitation_sent_at`, `invitation_channel` | Low | when/how the couple sent the invitation (0060) |
| `notes` | Free text. **May hold special-category data** (dietary needs revealing religion or health, allergies, disability/access needs) | |
| `household_names` | **Yes** (names of other people: the ones coming with the guest) | optional, typed by the guest in the RSVP or by the couple (0179) |
| `invited_party_size` | Yes, in context | how many people the couple invited with the guest; an answer above it is flagged (0179) |
| `no_meal_count` | Yes, in context | of the children, how many eat no adult menu ("дете / без оброк"); checked `≤ children_count ≤ party_size` (0181) |
| `menu_rechoose_at` | No | when the venue's menu change asked this confirmed guest to choose again (0181) |
| `created_at` | Low | |

- **Subject:** guest (entered by the couple, or self-entered via RSVP).
- **Purpose:** guest list, RSVP tracking, headcount and seating for the venue.
- **Lawful basis:** couple's legitimate interest / household activity, or the venue's contract. Controller vs processor role is open (*to confirm in COMP-001*, see Open questions).
- **Access:**
  - Couples via the service role in `lib/couple/guests.ts`, scoped by `event_id`.
  - Guests through `POST /api/invite/[slug]/rsvp`, then `submitRsvpBySlug` (`lib/couple/rsvp.ts`, service role). This can insert a row or update `rsvp_status`/`party_size` on a row the shared link surely matches (remembered browser token, a unique phone together with a name that fits that guest — 0184 —, or exactly one guest with that name — 0179); an unsure match changes no row and waits for the couple in `event_rsvp_answers` (§2.6a). With a personal link (`?g=<invite_token>`) it updates exactly that guest; the page shows that guest their own name, current answer and table only. Guests can **not** read the list.
  - Anyone with the shared link, through `POST /api/invite/[slug]/seat` ("Каде седам?", rate-limited): a typed name that matches exactly one guest returns only that guest's table/seat/room. An unknown name and a listed guest without a table get the same empty answer, so the list cannot be probed.
  - Venue staff have **no** access: RLS is on with no policies, and the table is granted to `service_role` only.
- **Retention:** none defined, see DATA-007. Cascades with the event.

### 2.6a `event_rsvp_answers`
Created in `0179_rsvp_answers_inbox.sql`. One row per RSVP answer, never overwritten: from a personal link, the shared link, or typed in by the couple (a phone answer). Since 0184 the couple's own direct changes (quick status toggle, party size, menu split) are recorded too, as `source 'couple'` rows with before/after, and `status` may then also be `invited`/`pending`.

| Field | Personal? | Notes |
|---|---|---|
| `full_name` | **Yes** | the name as typed on the shared link (the guest's name for personal-link and couple answers) |
| `phone` | **Yes** | optional, typed on the shared link to help matching |
| `status`, `party_size`, `children_count`, `no_meal_count` | Yes, in context | the answer (`no_meal_count`: children eating no adult menu, 0181) |
| `menu_counts` | **Yes. May reveal religion or health** | like `event_guest_menu_counts` |
| `allergies` | **Yes. Special-category (health) data** | ≤ 300 chars |
| `comment` | Free text | ≤ 500 chars |
| `household_names` | **Yes** | names of the people coming with the guest |
| `before`, `after` | **Yes** (copies of the guest's answer fields, incl. allergies and household names) | the change history the couple sees |
| `guest_id`, `source`, `match`, `review_state`, `resolved_at`, `resolved_by` | No | how the answer was matched; `resolved_by` is `couple`/`bride`/`groom` (a role, not a name); `review_state 'linked'` (0184): tied to a guest who had a newer answer without changing them |
| `review_reason` | No | 0180: why a pending answer waits besides an unsure match (`guest_limit`: the package's guest limit stopped the new guest) |
| `created_at` | Yes, in context | when the guest answered |

- **Subject:** guest (and the people they name as coming with them).
- **Purpose:** the couple's "Одговори" inbox and "Да се провери" queue (answers the shared link could not match surely), and each guest's answer history.
- **Access:** service role only (RLS on, no policies, no API-role grants): the RSVP route writes, the couple's routes (`/api/couple/rsvp-answers`, `/api/couple/guests/[id]/answers`) read and resolve. Guests never read it; the shared-link response never names another guest. Venue staff have no access.
- **Export / erasure:** exported with the event (`lib/privacy/export.ts`, `rsvp_answers`); deleted by `erase_event_personal_data` (0179) on every reason, and cascades with the event. Deleting a guest deletes their answers (0184: `guest_id` cascades; before, they stayed with `guest_id` null until the event was erased). Pending answers never applied to a guest have no `guest_id` and stay until the couple resolves them or the event is erased.
- **Retention:** with the event (DATA-007).

### 2.7 `event_invitations`
Created in `0022_organizer_tools.sql`.

| Field | Personal? | Notes |
|---|---|---|
| `message` | Free text by the couple (names, personal wording) | shown publicly |
| `photo_path` | Points to the couple's personal photo in `invitation-photos` | |
| `public_slug` | Access token for guests (9 random bytes, base64url) | |
| `template_id`, `created_at` | No | |

- **Subject:** couple.
- **Purpose:** public invitation page and RSVP entry point.
- **Lawful basis:** contract / consent of the couple to publish (*to confirm in COMP-001*).
- **Access:** couples via the service role (`lib/couple/invitations.ts`). Anyone holding the slug can read message, photo, couple names, date and venue via `getInvitationBySlug` (`app/invite/[slug]/page.tsx`). Staff have no policy.
- **Retention:** none defined, see DATA-007. The link stays live indefinitely after the event.

### 2.7a Menu choices: `event_guest_menu_counts`, `event_menu_submissions`
Created in `0119_event_menus_guest_counts.sql`.

| Table | Field | Personal? | Notes |
|---|---|---|---|
| `event_guest_menu_counts` | `count` (per `guest_id` × `menu_template_id`) | **Yes. May reveal religion or health** (e.g. how many of a guest's party eat the посно/vegan menu) | set by the guest's RSVP or by the couple |
| `event_menu_submissions` | `counts`, `menu_titles`, `total`, `no_meal_count` | Yes, in context (aggregate numbers per menu; `no_meal_count` is "Деца без оброк", 0181) | the numbers the couple sent to the venue |
| `event_menu_submissions` | `sent_by` | No | always the fixed "Младенците" |
| `event_menu_submissions` | `seen_by` | **Yes** (the venue manager's name) | set when a manager marks the numbers seen |
| `event_menu_submissions` | `estimated_counts`, `estimated_total` | Yes, in context (aggregate numbers) | 0182: the unanswered guests' part, estimated per menu by the couple or prefilled by the automatic send; always shown marked "проценка" |
| `event_menu_submissions` | `estimated_people` | Yes, in context (aggregate number) | 0184: how many people the estimate stood for, so later answers from that group shrink it instead of reading as new people |
| `event_menu_submissions` | `allergy_key` | **Yes, derived** (keyed HMAC of the allergy notes at sending; no text) | 0182: lets a later allergy change be flagged to the venue; cleared on erasure (0183) |

- **Kept across answers (0181):** a guest's counts stay when they answer "no" or "later" (or the couple changes the status); only confirmed guests count in the totals. Counts go when the guest is deleted, or for a menu the venue takes off the event in the event form (a package the venue deletes from its list while events use it is archived, `menu_templates.archived_at`, and stays on them).
- **Seating flags (0181):** `event_seat_guest_flags()` lets the venue's staff read, for **seated** guests only, their answer status and party size (names they already see on the plan), so the plan can flag "Одбил — ослободете ги местата".
- **Subject:** guests (counts); venue manager (`seen_by`).
- **Purpose:** telling the venue how many portions of each of the event's menus to prepare.
- **Access:** counts: service role only (couple routes and the RSVP), staff have no access. Submissions: staff read their own venue's rows via RLS; writes through server routes with the service role.
- **Export / erasure:** both are exported with their event (`lib/privacy/export.ts`). Counts cascade with `event_guests` on erasure; erasure clears `seen_by` (0122).
- **Retention:** none defined, see DATA-007. Cascades with the event.

### 2.7b Change marks: `event_changes`, `event_change_seen`, `event_couple_reminders`, `events.couple_first_login_at`, `event_menu_submissions.source`/`unanswered`
Created in `0125_event_change_marks.sql` (`mark_change_seen` in 0126, `insert_auto_menu_submission` in 0127).

| Table | Field | Personal? | Notes |
|---|---|---|---|
| `event_changes` | `section`, `side`, `field`, `changed_at` | Yes, in context (what changed in a person's event, and when) | log written by triggers; one row per changed field |
| `event_changes` | `changed_by` | **Yes** (the venue manager's name, or the couple side `Младенците` / `Ко-организатор`) | cleared on erasure |
| `event_changes` | `old_value`, `new_value` | Date, rooms, menus, guest count: yes, in context. **`contact`: direct contact data** (email, phone). **`finance`: financial data** | contact values are nulled on erasure |
| `event_change_seen` | `viewer`, `section`, `seen_up_to` | Low | how far each side has seen, per section |
| `event_change_seen` | `seen_by` | **Yes** (name of the manager or organizer who pressed Видено) | cleared on erasure |
| `event_couple_reminders` | `reminded_at` | Low | the venue's "Потсети го парот" reminders |
| `event_couple_reminders` | `reminded_by` | **Yes** (the venue manager's name) | rows deleted on erasure |
| `events` | `couple_first_login_at` | Low | set by the couple login; marks for the couple only count after it |
| `event_menu_submissions` | `source`, `unanswered` | No | who produced the numbers (couple, auto-send, venue) and how many guests had not answered |
| `event_changes` | section `numbers` (0182): `old_value` `{submissionId}`, `new_value` `{menus, noMeal, changes, allergies, allergyKey}` | Yes, in context (aggregate counts per menu, menu names; no guest names, allergies only as yes/no plus a keyed fingerprint) | "Промена по испратените бројки": written by `lib/couple/numbers-changes.ts` after a guest/couple write once numbers were sent; the venue confirms with Видено (any staff can read it, like `guest_count`). Erasure removes `allergyKey` (0183) |

- **Subject:** couple (contact and finance values, names of organizers); venue manager (`changed_by`, `seen_by`, `reminded_by`).
- **Purpose:** showing each side what the other changed since it last pressed Видено; reminding the couple to send the final menu numbers (25/20/15-day timeline, automatic send at 15 days by the cron).
- **Access:** service role only (RLS on, no policies, no API-role grants). Venue staff see the section of a contact or finance change but never its values without manager elevation (the server redacts them); only a manager can press Видено. Couple routes are scoped to the session's event.
- **Export / erasure:** all three tables are exported with their event (`lib/privacy/export.ts`). Erasure nulls contact `old_value`/`new_value`, `changed_by` and `seen_by`, and deletes `event_couple_reminders`; the erasure itself records no change rows.
- **Retention:** none defined, see DATA-007. Cascade-deleted with the event.

### 2.8 Couple planning tools (free text, incidental personal data)

| Table | Migration | Personal fields | Why it matters |
|---|---|---|---|
| `event_notes` | `0028_event_notes.sql` | `title`, `content` | Unbounded free text: vendor contacts, family matters |
| `event_locations` | `0022_organizer_tools.sql` | `label`, `address`, `map_url` | May be a **private home address** (e.g. the family house before the ceremony) |
| `event_agenda_items` | `0022_organizer_tools.sql`, `0156_agenda_places.sql` | `title`, `notes`, `time`, `location`, `address`, `map_url` | Names of people, a timeline of the day, and where each item takes place (may be a **private home address**, like `event_locations` below; since 0156 the couple's locations live here and `event_locations` is no longer written by the app) |
| `event_budget_items` | `0023_budget_checklist.sql` | `name`, `custom_label`, `estimated_amount`, `paid_amount` | Couple's spending, and vendor names (possibly sole traders) |
| `event_checklist_items` | `0023_budget_checklist.sql` (+ `0024` marker on events) | `title`, `due_date` | Low. Free text |
| `event_checklist_subtasks` | `0027_checklist_subtasks.sql` | `title` | Low. Free text (e.g. candidate photographers) |

- **Subject:** couple, and third parties named in the text.
- **Purpose:** the couple's own event planning.
- **Lawful basis:** contract with the couple (*to confirm in COMP-001*).
- **Access:** service role only. RLS is on with no policies. Couple routes go through `lib/couple/{notes,locations,agenda,budget,checklist,menu}.ts`, scoped by `event_id`. Venue staff have no access.
- **Retention:** none defined, see DATA-007. Cascades with the event (subtasks cascade via `checklist_item_id`).

### 2.9 `event_layout_elements.label` (and `room_layout_elements.label`, `room_fixed_elements.label`)
Created in `0012_floor_plan_layers.sql`.

- Free-text table labels. In the event layer these may hold guest names ("Table 3 – Petrovski family"). They are copied into `events.seating_draft*` (0020).
- **Access:** staff via RLS `"venue staff manage own event layout elements"` (0012). Couples via the service role in `lib/couple/seating.ts`. The organizer policy from 0012 was dropped in 0013.
- **Retention:** none defined, see DATA-007.

### 2.9a `event_seat_assignments`
Created in `0070_event_seat_assignments.sql`.

- Who sits on which seat of which table: `guest_id` (link to `event_guests`) or `guest_name` (free text, ≤ 200 chars — typed by the couple for people not on the guest list).
- **Subject:** guests. **Purpose:** seating plan, place cards, "Каде седам?".
- **Access:** staff via RLS `"venue staff manage own event seat assignments"` (0070). Couples and guests via the service role (`guest_seat()`).
- **Export / erasure:** exported as `seat_assignments`. Guest-linked rows cascade with the guest; every row is deleted when the event's personal data is erased (trigger on `events.personal_data_erased_at`).

### 2.10 `event_showcase_photos`
Created in `0008_event_showcase_photos.sql`.

- `photo_path`: a pointer to an event photo in the `event-showcase-photos` bucket. These are photos of past events and **likely show identifiable people** (couples, guests).
- **Subject:** couple/guests pictured.
- **Purpose:** venue portfolio.
- **Lawful basis:** consent of the people pictured, or the venue's legitimate interest (*to confirm in COMP-001*).
- **Access:** staff via RLS `"venue staff manage own event showcase photos"` (0008), through `lib/venue/showcase.ts` (browser client).
- **Retention:** none defined, see DATA-007. Deleting the row or the event does **not** delete the storage object.

### 2.11 `reservations` (+ `reservation_tables`)
Created in `0016_reservations.sql`. Policies replaced in `0017_reservations_room_venue_check.sql`, statuses in `0018_reservation_status_lifecycle.sql`.

| Field | Personal? |
|---|---|
| `guest_name` | **Yes** |
| `phone` | **Yes** (NOT NULL) |
| `email` | **Yes** (optional) |
| `date`, `start_time`, `end_time`, `party_size`, `event_type` | Yes, in context |
| `note` | Free text (may include dietary/health info) |
| `status` | Low |
| `server_name` | No — the venue staff member who took the booking, not the customer |

`reservation_tables` holds only IDs.

- **Subject:** reservation customer.
- **Purpose:** table bookings at the venue.
- **Lawful basis:** pre-contract / contract between venue and customer. The venue is controller, the platform is processor (*to confirm in COMP-001*).
- **Access:** staff via RLS `"venue staff manage own reservations"` / `"venue staff manage own reservation tables"` (0017), through `lib/venue/reservations.ts` (browser client: read, create, edit tables). Status changes and hard deletes go through `/api/venue/reservations/[id]` (0174 functions, service role); since 0178 staff have no DELETE grant on `reservations` (the booking form's clean-up after a failed table claim uses `discard_unbooked_reservation`), and a trigger keeps a mini event's reservation status in step with its event.
- **Erasure:** an event erasure (`erase_event_personal_data`) clears a mini event's reservation `email` and, since 0178, `note` on every reason; `guest_name`/`phone` only on request.
- **Retention:** none defined, see DATA-007. Since 0174 "Откажи" / "Гостите заминаа" keep the row (status `cancelled` / `completed`) instead of deleting it; only "Избриши засекогаш" removes it.
### 2.12 `contact_submissions`
Created in `0029_contact_submissions.sql`. Columns `status` (`new`/`read`/`answered`) and `handled_at` added in `0050_contact_status_and_settings.sql` (admin dashboard task 4.1) — triage state, not personal data. Column `kind` (`contact`/`demo`) added in `0173_contact_submission_kind.sql`: `demo` rows come from the "request a demo" form at `/signup` (public self-signup is closed) and carry the venue name, city and phone inside `message`.

| Field | Personal? |
|---|---|
| `name`, `email`, `message`, `created_at` | **Yes** (a demo request's `message` holds the sender's phone) |
| `status`, `handled_at`, `kind` | No — the admin's own triage state / the row's type |

- **Subject:** contact-form or demo-request sender.
- **Purpose:** answering sales enquiries about the platform.
- **Lawful basis:** legitimate interest / pre-contract steps at the sender's request (*to confirm in COMP-001*).
- **Access:** insert via the public, unauthenticated `POST /api/venue/contact` (`submitContactMessage`, `lib/venue/contact.ts`, service role; no anon grant or RLS policy — anonymous visitors write only through that server route). Read and `status`/`handled_at` updates via the admin **Контакт пораки** page (`lib/admin/message-actions-core.ts`, also service role only).
- **Retention:** **6 months after receipt** (contact and demo rows alike), deleted by `purge_old_contact_submissions()` via the daily `/api/cron/retention` (0170, 0178). Audited as `contact_submissions_purged` (count only).

### 2.12a Guests' album and greetings: `event_photos`, `event_greetings`, `event_albums`
Created in `0080` (album, greetings, public token), `0081` (unconfirmed uploads bucket), `0151` (greetings from the invitation with `guest_id`; videos in the album).

| Field | Personal? |
|---|---|
| `event_photos.storage_path` (photo or video file), `uploader_name` (optional), `consent_at` | **Yes** — files likely show identifiable people |
| `event_greetings.first_name`, `last_name`, `message`, `video_path`, `guest_id` | **Yes** |
| `event_greetings.rsvp_answer_id` (0180) | No — a link to the pending RSVP answer the greeting was sent with; it moves to the guest the couple picks |
| `event_albums.public_token` | Credential (the album link/QR) |
| sizes, mime, dimensions, `hidden_at`, timestamps | No / low |

- **Subject:** guests who upload or send a greeting; anyone pictured.
- **Purpose:** the couple's album of the event and greetings from guests.
- **Lawful basis:** the uploader's consent (checkbox, `consent_at`; required by `lib/media/guest-api.ts`) for showing the files in the album; the sender's consent for a greeting; for other people pictured, the couple's/venue's legitimate interest. The venue is controller, the platform is processor (*to confirm in COMP-001*; privacy policy 1.3 states it).
- **Access:** service role only. Guests upload through `/api/e/[token]/…` (upload only, they never see other uploads) and send greetings through `/api/invite/[slug]/greetings…`; couples read, hide, delete and download through `/api/couple/album/…` and `/api/couple/greetings/…`. Files live in the **private** `event-media` bucket. Venue staff have no panel view; the venue's data export includes the rows.
- **Retention:** erased with the event's personal data (6 months after the event, or 30 days after a cancellation, 0170): a trigger on `events.personal_data_erased_at` deletes the rows and the token and queues the files. A per-package shorter album period exists (`runMediaRetention()`) but is **off** (`MEDIA_RETENTION_ENABLED` unset); see RETENTION.md.

### 2.12b `support_tickets` (+ `support_ticket_messages`)
Created in `0089_support_tickets.sql`; threads and statuses in `0150_support_inbox_and_admin_tasks.sql`.

| Field | Personal? |
|---|---|
| `name`, `problem`, `description`, `support_ticket_messages.body` | **Yes** (free text) |
| `venue_id`, `event_id`, `submitted_by`, `status`, flags, timestamps, `admin_user_id` | No / low |

- **Subject:** venue staff or a couple asking the platform for help.
- **Purpose:** support.
- **Lawful basis:** venue tickets — contract with the venue (platform = controller); couple tickets — part of the venue's service to the couple (platform = processor; the venue never sees them) (*to confirm in COMP-001*).
- **Access:** service role only (`lib/support/tickets.ts`, admin inbox). A venue sees only its own tickets, a couple only its event's.
- **Retention:** closed tickets (`status = 'done'`) are deleted **6 months after `resolved_at`** with their threads (`purge_closed_support_tickets()`, 0176/0178; audited `support_tickets_purged`). A couple's tickets also go with the event's erasure (0171). Deleted with the venue by cascade. Not in the venue's data export.

### 2.13 Tables with no personal data (checked)
`rooms`, `table_types` (0001), `menu_templates` (`archived_at`, 0181: a package taken off the venue's list but kept on the events that use it), `menu_items` (0002, 0007, 0019, 0030; `photo_path` points to dish photos), `menu_template_items` (0019), `event_rooms` (0003, 0026), `event_menu_templates` (0115; which menus an event offers; `menu_templates.event_id` (0119) marks an event's own custom menu), `room_fixed_elements` and `room_layout_elements` apart from free-text `label` (0012).

### 2.14 Entitlements: `plans`, `plan_features`, `venue_feature_overrides`, `event_feature_overrides`, `platform_settings`, and `venues.plan_id`/`blocked_at`/`blocked_reason`
`plans`/`plan_features`/`venue_feature_overrides`/`event_feature_overrides`/`venues.plan_id`/`blocked_at`/`blocked_reason` created in `0048_plans_and_entitlements.sql`; `plans.is_public` added in `0052_plans_is_public.sql`; `platform_settings` created in `0050_contact_status_and_settings.sql` (admin dashboard task 4.1 — the DB half of the maintenance-mode flag, `lib/platform-settings.ts`; `updated_by` is an `auth.users.id`, no direct personal-data column). See [ADMIN.md](ADMIN.md) for the resolution order and the plans/overrides model in full.

- **Subject:** none — this is platform configuration (which features a venue's plan unlocks; whether the site is in maintenance), not venue/couple/guest data. The one exception is free text: `venue_feature_overrides.note`, `event_feature_overrides.note`, and `venues.blocked_reason` are the **platform admin's own** justification for an override or a block, not authored by or belonging to the venue.
- **Access:** service role only (`effective_features`, `event_has_feature`, `venue_has_feature`, `feature_limit`, and `platform_settings` reads/writes from `lib/platform-settings.ts`/the admin System page); RLS is on with no policies, no `anon`/`authenticated` table grants on any of these tables.
- **Export/retention:** the admin's override/block notes above are **not** included in the venue's own data export (`lib/privacy/export.ts`; see `NOT_EXPORTED` in `tests/supabase/privacy_guard.test.ts`) — they're the platform's record about the venue, not the venue's record. `plans`/`plan_features`/`platform_settings` hold no personal data at all. No retention mechanism defined; not applicable (no personal subject).

### 2.15 Historic (removed, not in the final schema)
- `events.couple_user_id` (0003) was dropped in `0010_event_organizers.sql`. Its values moved to `event_organizers`.
- `event_guests.menu_choice` (0060; standard / posno / vegetarian, could reveal religion), `event_menu_item_quantities` (0022), `event_custom_menu_items` (0013) and `events.menu_template_id` (0002/0003) were **dropped** in `0122_drop_single_menu_and_couple_picker.sql`, replaced by the 0115/0119 menu tables (§2.7a).
- `event_organizers` (`event_id`, `user_id` to `auth.users`) was created in `0010`, got an RLS fix in `0011_fix_event_organizers_rls_recursion.sql`, and was **dropped** in `0013_couple_dashboard.sql` together with `is_organizer_for_event()`. Couples no longer have Supabase Auth accounts. Any `auth.users` rows created for organizers before 0013 are **not** removed by the migration. Check production for orphans (DATA-005).

---

## 3. Supabase Auth (`auth` schema)

Only **venue staff** have Auth accounts. Couples and guests do not (since 0013).

| Location | Fields | Notes |
|---|---|---|
| `auth.users` | `email`, `encrypted_password` (bcrypt), `email_confirmed_at`, `last_sign_in_at`, `created_at`, `raw_user_meta_data` (empty: `signUp({ email, password })` in `components/auth/SignupForm.tsx` sends no metadata), `confirmation_token`/`recovery_token` | |
| `auth.identities` | email identity | |
| `auth.sessions`, `auth.refresh_tokens` | session and refresh tokens. Current GoTrue versions also store `ip` and `user_agent` on sessions | |
| `auth.audit_log_entries` | `ip_address` and a JSON payload (actor email, action: login, signup, recovery) | Supabase auth logs are also visible in the dashboard log explorer |

- **Subject:** venue staff.
- **Purpose:** authentication, account recovery, security auditing.
- **Lawful basis:** contract; legitimate interest (security) for IP/audit data (*to confirm in COMP-001*).
- **Access:** Supabase (GoTrue) itself; the platform operator via the dashboard or the service role. Staff see only their own session.
- **Retention:** none defined by us, see DATA-007. Audit-log and platform-log retention follows Supabase plan defaults. Record them in DATA-007.
- **`public.auth_user_deletion_retries`** (0178): `user_id` (+ the deleted venue's id, attempt count, last error) of a staff Auth user whose deletion failed after the venue was deleted. Service role only. The daily `/api/cron/retention` retries it and removes the row once the Auth user is gone; it holds no email or name.
- Auth emails (confirm, reset password) are sent today by **Supabase's built-in SMTP**. They move to Resend in INFRA-006.

---

## 4. Supabase Storage

All three buckets are created `public = true`. That means any object can be downloaded by anyone who has its URL.

| Bucket | Created in | Contents | Path scheme | Write | Read |
|---|---|---|---|---|---|
| `menu-item-photos` | `0007_menu_item_price_photo.sql` | Dish photos (not personal) | `{venue_id}/...` | staff, via storage policies `"venue staff upload/update/delete own menu item photos"` (`is_venue_staff_for(foldername[1])`) | public: `"public read menu item photos"` |
| `event-showcase-photos` | `0008_event_showcase_photos.sql` | **Photos of events, likely showing people** | `{venue_id}/{event_id}-{timestamp}.{ext}` (`lib/venue/showcase.ts`) | staff: none since 0109 (uploads go through a manager-gated signed URL) | public: `"public read event showcase photos"` |
| `invitation-photos` | `0022_organizer_tools.sql` | **Couples' personal photos** (engagement/portrait) | `{event_id}-{timestamp}.{ext}` at bucket root (`uploadInvitationPhoto` in `lib/couple/invitations.ts`) | service role only (couple route) | public: `"public read invitation photos"` |
| `event-media` (+ `event-media-uploads`) | `0080`, `0081` | **Guests' album photos/videos and video greetings** | under the event's id | service role only (signed upload URLs) | **private**: the couple's routes only (§2.12a) |

Observations for SEC/DATA tasks:

- The `"public read …"` policies are `for select` on `storage.objects` **for every role, including `anon`**. In Supabase a public bucket needs no SELECT policy for downloads by URL. The policy also lets anyone **list** the bucket through the Storage API. For `invitation-photos` that means anyone holding the public anon key can enumerate every couple's photo and the `event_id` in each filename. Recommend removing the select policies, or scoping them, and keeping the bucket public only for URL access.
- Photos are not deleted when their event, invitation or venue is deleted (no cascade from Postgres to Storage). Replacing an invitation photo leaves the old object in place (a new timestamped path each time).
- Image EXIF metadata (including GPS) is not stripped on upload.

---

## 5. Cookies and browser storage

| Name | Set by | Content | Attributes | Purpose |
|---|---|---|---|---|
| `couple_session` | `app/api/couple/login/route.ts` | 32-byte random token (maps to `couple_sessions.token`) | HttpOnly, Secure, SameSite=Lax, Path=/, expires in 30 days, sliding (renewed by `proxy.ts`) | Couple login. Strictly necessary |
| `sb-<project-ref>-auth-token` (may be chunked `.0`, `.1`) | `@supabase/ssr` (`lib/supabase/client.ts`, `lib/supabase/server.ts`) | Supabase access JWT (contains user id and email) + refresh token | Written by the browser client, so **not HttpOnly**. SameSite=Lax. Long-lived (refresh-token based) | Venue staff login. Strictly necessary |

- No analytics, advertising or third-party cookies. No `localStorage`/`sessionStorage` use found in `app/`, `components/` or `lib/`.
- Hint for COMP-001: all cookies look strictly necessary, so there is no consent banner (*to confirm*).

---

## 6. Data flows

```
Venue staff browser
  ├─ HTTPS → Vercel (dub1) → Next.js server components / route handlers
  │                            └─ @supabase/ssr (user JWT) → Supabase eu-west-1 (Postgres, RLS applies)
  ├─ HTTPS → Supabase eu-west-1 directly (anon key + user JWT; RLS is the gate)
  │           - Postgres: events, reservations, layouts, showcase metadata
  │           - Storage: upload menu / showcase photos
  │           - Auth: signup, login, password reset (emails via Supabase SMTP → later Resend)
  └─ POST /api/venue/signup → Vercel → service role → venues + venue_staff

Couple browser
  └─ HTTPS (cookie couple_session) → Next.js proxy (proxy.ts, formerly middleware; validates the session
       via service role, injects x-couple-event-id)
       → /couple/* pages and /api/couple/* routes (dub1)
       → service role → Supabase eu-west-1 (every query scoped by event_id)
       → invitation photo upload → Storage `invitation-photos`

Guest browser
  ├─ GET /invite/[slug] → Vercel → service role → event_invitations + events + venues (read only)
  ├─ GET photo → Supabase Storage public URL (direct, no Vercel)
  ├─ POST /api/invite/[slug]/rsvp → Vercel → service role → event_guests (insert/update)
  ├─ POST /api/invite/[slug]/greetings(/video) → Vercel → service role → event_greetings (+ event-media file)
  └─ POST /api/e/[token]/photos|videos(/confirm) → Vercel → service role → event_photos (+ event-media file, consent required)

Anonymous visitor (marketing page)
  ├─ POST /api/venue/contact → Vercel → service role → contact_submissions (insert)
  └─ POST /api/venue/demo (/signup demo request) → Vercel → service role → contact_submissions (insert, kind demo)

Operations
  ├─ Vercel function / request logs: IP, URL (including /invite/<slug> and a personal link's ?g=<invite_token>), user agent
  ├─ Sentry (planned, OBS-001): errors from server and browser, PII scrubbed
  ├─ Postgres rate_limits (SEC-002, same Supabase project): hashed-IP counters, purged after 1 day
  └─ Supabase → Cloudflare R2 (planned, DATA-001): encrypted off-site DB dumps
```

Note: Vercel Edge Middleware may run in the edge location nearest the visitor rather than only in `dub1`. The `couple_session` token and URLs pass through it. Confirm whether this counts as processing outside the EU (COMP-001).

---

## 7. Processors (sub-processors of the platform)

| Processor | Status | Service | Personal data it receives | Region / location | Transfer notes | Task |
|---|---|---|---|---|---|---|
| **Supabase** | **Live** | Postgres DB, Auth, Storage, built-in auth SMTP, platform logs, backups | Everything in sections 2 to 4 | Project region **eu-west-1 (Ireland, EU)** (`docs/production/SETUP.md`) | Supabase Inc. is US-based. Sign the DPA, check the sub-processor list and SCCs | COMP-001 |
| **Vercel** | **Live** (being configured) | Hosting, serverless functions, Edge Middleware, request/function logs | Everything in transit. Request logs hold **IP addresses, URLs (including invitation slugs), user agents** | Functions **dub1 (Dublin, EU)** (`vercel.json` `"regions": ["dub1"]`). Edge network is global | Vercel Inc. is US-based. DPA, SCCs/DPF | INFRA-* / COMP-001 |
| **Resend** | **Planned** | Transactional email and auth emails (custom SMTP for Supabase Auth) | Recipient email, email content (names, event details, reset links) | EU region to select when configured | US company. DPA | INFRA-006 |
| **Sentry** | **Planned** | Error and performance monitoring | Stack traces, request metadata. **Must scrub PII**: no emails, names, cookies, `couple_session`, slugs, IPs (`sendDefaultPii: false`, `beforeSend` scrubbing) | **EU data region, `de.sentry.io` (Frankfurt)** | US company, EU storage. DPA | OBS-001 |
| **Cloudflare R2** | **Planned** | Off-site database backups | A full copy of the database (all of section 2, plus the `auth` schema if included) | **EU jurisdiction bucket** | Encrypt dumps before upload. DPA | DATA-001 |
| **GitHub** | **Planned** (with R2) | GitHub Actions runs `.github/workflows/backup.yml` nightly on GitHub-hosted runners | Temporarily, during the job: a full database dump and all Storage objects, before encryption and upload to R2 | GitHub-hosted runner region (not guaranteed EU; to confirm) | GitHub/Microsoft, US. DPA (GitHub customer agreement / DPA) | DATA-001, COMP-001 (legal review R1-07) |

There are no other integrations (no analytics, payments, CRM or maps API; `map_url` is a stored link only).

---

## 8. Retention: current state (input for DATA-007)

Since migration 0043, export, event erasure and venue account deletion exist; since 0170 the retention sweep runs daily (event personal data 6 months after the event, contact messages after 6 months); since 0172 the same cron deletes venues whose admin-scheduled deletion (15 days after the admin's request) is due; since 0176 it also deletes support tickets closed more than 6 months ago. See `docs/production/RETENTION.md`. The table below is the state before that.

| Data | Current behaviour |
|---|---|
| All `public` tables | Kept forever. Nothing deletes or anonymizes after the event |
| Event and all couple/guest data | Deleted only if staff delete the event, or the venue is deleted (cascade) |
| `couple_sessions` | Expired rows never purged |
| `contact_submissions` | Kept forever |
| Storage objects | Never deleted by cascade. Orphaned after event/venue deletion or photo replacement |
| `auth.users` | Kept until manually deleted. Deleting one removes `venue_staff` only, and the venue stays |
| Supabase backups / PITR, Vercel logs | Provider/plan defaults. Record the actual values |

---

## 9. Open questions (for COMP-001, DATA-005, DATA-007)

1. **Retention after the wedding:** how long do we keep guest lists, couple contact data, notes, budget and invitation photos after `event_date`? Options: anonymize guests N months after the event, keep an event summary for the venue's records, and deactivate the public invitation link after the event. (DATA-007)
2. **Controller vs processor for guest data:** is the platform a processor for the venue, the venue a controller for the couple's guest list, or is the couple the controller (household exemption not applying once shared with a business)? This drives who answers guest access/deletion requests and what the privacy notice on `/invite/[slug]` says. (COMP-001, DATA-005)
3. **Deletion on venue account closure:** when a venue closes its account, do we delete the venue (and so, by cascade, every event, guest, reservation and note), and what happens to the Storage objects and backups? Today deleting the staff auth user leaves an orphaned venue with all its data. (DATA-005, DATA-007)
4. **Couple access after the event and couple deletion requests:** couples have no self-service export or delete. Who fulfils them (venue or platform), and within what SLA? (DATA-005)
5. **Showcase photos:** is there a consent basis for publishing photos of identifiable guests in a public bucket? (COMP-001)
6. **Special-category data in free text** (`event_guests.notes`, `reservations.note`, `event_notes.content`): accept with a UI hint ("do not enter health data"), or treat as special-category data under Art. 9? (COMP-001)
7. **Contact submissions:** retention period, and who at the platform operator reads them. (DATA-007)
8. **Backups:** how long do deleted records survive in Supabase PITR and R2 dumps, and is that disclosed? (DATA-001, DATA-007)
9. **Legacy auth accounts:** remove any `auth.users` created for couples/organizers before migration 0013? (DATA-005)
10. **International transfers:** confirm DPAs and transfer mechanisms for the US-parent processors (Supabase, Vercel, Resend, Sentry, Cloudflare), and whether Vercel edge middleware outside the EU is acceptable. (COMP-001)

---

## 10. Verification

Cross-checked against migrations `0001` to `0030`. Every `create table`, `alter table … add/drop column`, `drop table`, and every `storage.buckets` insert was reviewed in file order. Personal-data tables in the final schema: `venues` (business/PIN), `venue_staff`, `events`, `event_credentials`, `couple_sessions`, `event_guests`, `event_invitations`, `event_notes`, `event_locations`, `event_agenda_items`, `event_budget_items`, `event_checklist_items`, `event_checklist_subtasks`, `event_layout_elements` (labels), `event_showcase_photos`, `reservations`, `contact_submissions`. Plus `auth.*` and the buckets `event-showcase-photos` and `invitation-photos`. Dropped: `event_organizers`, `events.couple_user_id`.

**0157:** `rooms.address` and `rooms.map_url` (a hall's address and map link, entered by staff) are classified *none*: they describe a business premises that is printed on guests' invitations anyway, unlike `venues.address` (personal only for a sole trader).
**0158:** `events.agenda_seeded_at` (classified *none*) marks that the new event's first agenda item, the restaurant, was added once.
