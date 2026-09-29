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
| **Venue staff** | Owner/employees of a venue (restaurant, hall) | Supabase Auth email + password, `/signup`, `/login`, `/venue/*` |
| **Venue (as a business)** | The venue itself. Personal data only if it trades under a person's name (sole trader) | Created at signup (`lib/venue/provisioning.ts`) |
| **Couple** (event organizer) | The client of the venue: bride/groom, or the organizer of a birthday, graduation etc. | One shared username/password per event, created by venue staff (`event_credentials`), `/couple/*` |
| **Guest** | Invited people on the couple's guest list, plus anyone who RSVPs via the link | No account. The invitation slug is the only credential, `/invite/[slug]` |
| **Reservation customer** | Someone who books a table directly with the venue (not an event) | Never touches the app. Entered by venue staff |
| **Contact-form sender** | A prospective venue customer writing through the marketing page | Public form on `/`, `POST /api/venue/contact` |
| **Third parties named in free text** | Vendors (photographer, band), family members, and anyone else named in notes, budget lines, agenda, table labels | Typed in by couples or staff |

---

## 2. Personal data in Postgres (Supabase, `public` schema)

### 2.1 `venues`
Created in `0001_venues_rooms_tables.sql`. Column added in `0012_floor_plan_layers.sql`.

| Field | Personal? | Notes |
|---|---|---|
| `name` | Only for a sole trader | Business name, shown on public invitations (`getInvitationBySlug`) |
| `layout_lock_password_hash` | Credential (bcrypt) | Shared venue "layout lock" PIN. Default is `crypt('0000')`. Never selected by clients. Set/checked only via `set_venue_layout_password` / `verify_venue_layout_password` (SECURITY DEFINER, gated by `is_venue_staff_for`) |

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
| `seating_draft`, `seating_draft_undo`, `seating_confirmed_at`, `layout_undo_snapshot` | Incidental. JSON copies of layout elements including free-text `label` (may hold guest names) | 0020, 0012 |
| `checklist_seeded_at` | No | 0024 |
| `personal_data_erased_at` | No. Set by the event erasure (DATA-005) | 0043 |

- **Subject:** couple (and, through labels, possibly guests).
- **Purpose:** managing the booking and event (contract with the couple), contacting the couple, keeping payment records.
- **Lawful basis:** contract / pre-contract steps between venue and couple. Financial records may fall under a legal obligation (accounting) (*to confirm in COMP-001*).
- **Access:**
  - Venue staff via RLS `"venue staff manage own events"` (0004). This is full CRUD from the browser: `lib/venue/events.ts` selects all contact and finance columns, and `components/venue/dashboard/ClientsClient.tsx` lists them.
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

### 2.5 `couple_sessions`
Created in `0013_couple_dashboard.sql`.

| Field | Personal? | Notes |
|---|---|---|
| `token` | Session secret (online identifier) | 32 random bytes, hex (`lib/couple/session-token.ts`). Only its **SHA-256 hash** is stored (migration 0032, SEC-008); the raw value exists only in the cookie |
| `event_id`, `created_at`, `expires_at` | Links the session to a couple | 30-day sliding expiry (`lib/couple/session-verify.ts`) |

- **Subject:** couple.
- **Purpose:** keeping the couple logged in.
- **Lawful basis:** contract / strictly necessary (*to confirm in COMP-001*).
- **Access:** service role only. `proxy.ts` goes through `lib/couple/session-verify.ts`. No policies.
- **Retention:** rows are deleted on logout only. **Expired rows are never purged.** Needs a cleanup job, see DATA-007.

### 2.6 `event_guests`
Created in `0022_organizer_tools.sql`. `side` added in `0025_guest_side.sql`.

| Field | Personal? | Notes |
|---|---|---|
| `full_name` | **Yes** | |
| `phone` | **Yes** | optional |
| `party_size` | Yes, in context | |
| `rsvp_status` | Yes (attendance) | invited / confirmed / declined / pending |
| `side` | Yes (family relationship: bride's or groom's side) | 0025 |
| `notes` | Free text. **May hold special-category data** (dietary needs revealing religion or health, allergies, disability/access needs) | |
| `created_at` | Low | |

- **Subject:** guest (entered by the couple, or self-entered via RSVP).
- **Purpose:** guest list, RSVP tracking, headcount and seating for the venue.
- **Lawful basis:** couple's legitimate interest / household activity, or the venue's contract. Controller vs processor role is open (*to confirm in COMP-001*, see Open questions).
- **Access:**
  - Couples via the service role in `lib/couple/guests.ts`, scoped by `event_id`.
  - Guests through `POST /api/invite/[slug]/rsvp`, then `submitRsvpBySlug` (`lib/couple/rsvp.ts`, service role). This can insert a row or update `rsvp_status`/`party_size` on a row whose name matches. Guests can **not** read the list.
  - Venue staff have **no** access: RLS is on with no policies, and the table is granted to `service_role` only.
- **Retention:** none defined, see DATA-007. Cascades with the event.

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

### 2.8 Couple planning tools (free text, incidental personal data)

| Table | Migration | Personal fields | Why it matters |
|---|---|---|---|
| `event_notes` | `0028_event_notes.sql` | `title`, `content` | Unbounded free text: vendor contacts, family matters |
| `event_locations` | `0022_organizer_tools.sql` | `label`, `address`, `map_url` | May be a **private home address** (e.g. the family house before the ceremony) |
| `event_agenda_items` | `0022_organizer_tools.sql` | `title`, `notes`, `time` | Names of people and a timeline of the day |
| `event_budget_items` | `0023_budget_checklist.sql` | `name`, `custom_label`, `estimated_amount`, `paid_amount` | Couple's spending, and vendor names (possibly sole traders) |
| `event_checklist_items` | `0023_budget_checklist.sql` (+ `0024` marker on events) | `title`, `due_date` | Low. Free text |
| `event_checklist_subtasks` | `0027_checklist_subtasks.sql` | `title` | Low. Free text (e.g. candidate photographers) |
| `event_menu_item_quantities` | `0022_organizer_tools.sql` | `guest_count` | Not personal on its own |

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

`reservation_tables` holds only IDs.

- **Subject:** reservation customer.
- **Purpose:** table bookings at the venue.
- **Lawful basis:** pre-contract / contract between venue and customer. The venue is controller, the platform is processor (*to confirm in COMP-001*).
- **Access:** staff via RLS `"venue staff manage own reservations"` / `"venue staff manage own reservation tables"` (0017), through `lib/venue/reservations.ts` (browser client).
- **Retention:** none defined, see DATA-007.

### 2.12 `contact_submissions`
Created in `0029_contact_submissions.sql`.

| Field | Personal? |
|---|---|
| `name`, `email`, `message`, `created_at` | **Yes** |

- **Subject:** contact-form sender.
- **Purpose:** answering sales enquiries about the platform.
- **Lawful basis:** legitimate interest / pre-contract steps at the sender's request (*to confirm in COMP-001*).
- **Access:** insert only. The public, unauthenticated `POST /api/venue/contact` calls `submitContactMessage` (`lib/venue/contact.ts`), which uses the service role. There is **no anon grant or RLS policy**: anonymous visitors write only through that server route. Nothing in the app reads the table. It is read manually by the platform operator with SQL (Supabase dashboard).
- **Retention:** none defined, see DATA-007. Nothing ever deletes these rows.

### 2.13 Tables with no personal data (checked)
`rooms`, `table_types` (0001), `menu_templates`, `menu_items` (0002, 0007, 0019, 0030; `photo_path` points to dish photos), `menu_template_items` (0019), `event_rooms` (0003, 0026), `event_custom_menu_items` (0013), `room_fixed_elements` and `room_layout_elements` apart from free-text `label` (0012).

### 2.14 Historic (removed, not in the final schema)
- `events.couple_user_id` (0003) was dropped in `0010_event_organizers.sql`. Its values moved to `event_organizers`.
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
- Auth emails (confirm, reset password) are sent today by **Supabase's built-in SMTP**. They move to Resend in INFRA-006.

---

## 4. Supabase Storage

All three buckets are created `public = true`. That means any object can be downloaded by anyone who has its URL.

| Bucket | Created in | Contents | Path scheme | Write | Read |
|---|---|---|---|---|---|
| `menu-item-photos` | `0007_menu_item_price_photo.sql` | Dish photos (not personal) | `{venue_id}/...` | staff, via storage policies `"venue staff upload/update/delete own menu item photos"` (`is_venue_staff_for(foldername[1])`) | public: `"public read menu item photos"` |
| `event-showcase-photos` | `0008_event_showcase_photos.sql` | **Photos of events, likely showing people** | `{venue_id}/{event_id}-{timestamp}.{ext}` (`lib/venue/showcase.ts`) | staff: `"venue staff upload/delete own event showcase photos"` | public: `"public read event showcase photos"` |
| `invitation-photos` | `0022_organizer_tools.sql` | **Couples' personal photos** (engagement/portrait) | `{event_id}-{timestamp}.{ext}` at bucket root (`uploadInvitationPhoto` in `lib/couple/invitations.ts`) | service role only (couple route) | public: `"public read invitation photos"` |

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
  └─ POST /api/invite/[slug]/rsvp → Vercel → service role → event_guests (insert/update)

Anonymous visitor (marketing page)
  └─ POST /api/venue/contact → Vercel → service role → contact_submissions (insert)

Operations
  ├─ Vercel function / request logs: IP, URL (including /invite/<slug>), user agent
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

Since migration 0043, export, event erasure, venue account deletion and a (not yet scheduled) retention sweep exist. See `docs/production/RETENTION.md`. The table below is the state before that.

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
