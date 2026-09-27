# Marketing Page & Self-Serve Venue Signup — Design

Status: approved · architectural
Spec for: public marketing homepage at `/`, self-serve venue signup flow, and a
one-time post-signup welcome screen.

## Context

Every venue in the app so far has been created by manually seeding the
database. This is the first self-serve entry point: a prospect finds the
site, signs up, and lands in a fully working (unrestricted) venue dashboard
they can explore on their own. If they want to become a paying customer,
that conversation and the actual transaction happen off-platform, directly
with the team — this feature does not include payment processing.

Two things are explicitly deferred to later work, not part of this spec:
- **Feature entitlements/gating** — a self-signed-up venue gets the exact
  same full dashboard as every other venue, no restrictions.
- **Per-venue branding** (logo/accent color) — every venue still uses the
  one fixed Diamond-style `.vp` skin. Custom branding is applied manually,
  off-platform, after a prospect becomes a paying client.

## 1. Marketing page (`/`)

Replaces the current placeholder `app/page.tsx` (a single "Go to venue
panel" link). The existing `RecoveryRedirect` component must be preserved
on this route — it currently handles Supabase password-reset redirect
links landing on `/`.

Single page, anchor-linked nav, matching the structure of the client's
original marketing mockup (`Почетна / За платформата / Како работи /
Планови / Контакт`):

- **Hero** — "КАДЕ СУМ?" brand mark (reuse the diamond mark SVG already
  used in `PanelShell`/`AuthScreen`), tagline, one-line value proposition,
  two CTAs: "Започни бесплатно" → `/signup`, "Најави се" → `/login`.
- **Feature strip** — 4 cards: Организирај, Резервирај, Гости и покани,
  Менија & Пакети. Icons reused from the existing `IconSprite.tsx` set, no
  new icon assets.
- **Како работи** — 3–4 step explainer: sign up → set up your venue →
  manage events → invite couples.
- **Планови (pricing)** — 3 demo tiers (content below), clearly a preview,
  not a live checkout. Each card's CTA scrolls to Contact.
- **Контакт** — name/email/message form. No email/CRM integration exists
  yet, and building one is out of scope here — submissions are written to
  a new minimal `contact_submissions` table (name, email, message,
  created_at) via a service-role-backed route, so they're at least
  durably captured until a real delivery destination is decided. No UI
  reads this table yet; retrieval is a manual `select` for now.
- **Footer** — short sustainability strip, matching the mockup's tone.

### Pricing content (placeholder, easy to edit later)

| Tier | Price | Includes |
|---|---|---|
| Основен | 1,500 ден/месечно | 1 локал, до 2 простории, основно управување со настани, резервации, распоред на маси |
| Про | 3,500 ден/месечно | Сè од Основен, плус менија/пакети, буџет и чеклиста за парови, дигитални покани со QR код, известувања (наскоро) |
| Премиум | По договор | Сè од Про, плус брендирање по мерка на локалот, извештаи и аналитика, приоритетна поддршка |

## 2. Signup flow (`/signup`)

Form fields: venue name, email, password. Nothing else — matches the
low-friction "try it yourself" framing. No email verification required;
the account is usable immediately.

**Flow:**
1. Client calls `supabase.auth.signUp({ email, password })` directly via
   the existing browser Supabase client (`lib/supabase/client.ts`) — the
   same mechanism `/login` already uses for sign-in. This establishes an
   authenticated browser session immediately (no email confirmation step
   configured, so the session is live right away).
2. Client calls a new server route, `POST /api/venue/signup`, with only
   `{ venue_name }` in the body. The route:
   - Resolves the calling user from the request's own Supabase session
     (via `createServerSupabaseClient()`, same pattern as every other
     venue page) — never trusts a user id from the payload.
   - Checks `venue_staff` for an existing row for this user first. If one
     exists (e.g. a retried call after a prior partial failure), returns
     that venue's id — **idempotent**, never creates a second venue for
     the same account.
   - Otherwise, using `createServiceRoleClient()` (consistent with the
     existing rule that `venue_staff` is never written by a direct client
     grant — see migration `0004_rls_policies.sql`), inserts a new
     `venues` row and a `venue_staff` row linking them in one operation.
   - Returns `{ venue_id }`.
3. On success, client redirects to `/venue/welcome`.

**Why this shape, not the alternative considered:** a single server route
that also creates the Supabase auth user itself (via the admin API) was
ruled out — it would additionally need to fabricate a login session and
write auth cookies by hand. Letting Supabase's own client-side `signUp()`
do what it already does well, and keeping the server route responsible
only for provisioning the venue against an already-authenticated session,
is less code and reuses a proven path.

### Error handling

- Duplicate email during `signUp()` → Supabase's own error surfaces
  inline on the form (same inline-error pattern already used on
  `/login`'s forgot-password flow).
- `/api/venue/signup` fails after auth succeeded → the user is logged in
  with no venue yet. The signup page catches this and retries the
  provisioning call once automatically before showing a visible error —
  a transient blip shouldn't strand a freshly-created account.
- Empty/whitespace venue name → rejected client-side before submit.

## 3. Welcome screen (`/venue/welcome`)

Shown once, immediately after signup redirects there. Uses the existing
`.vp` panel styling directly (not the full `PanelShell` sidebar — there's
no data yet to justify the full shell).

- Greeting: "Добредојдовте во КАДЕ СУМ?, {venue name}!"
- A static checklist of first steps (not live-tracked — does not check
  whether a room/menu/event actually exists yet, just shown once and never
  reappears):
  1. Додади простории → `/venue/tables`
  2. Додади мени → `/venue/menus`
  3. Создади пробен настан → `/venue/events/new`
- "Продолжи кон контролната табла" → `/venue`, plus a "Прескокни" link
  doing the same thing.

A stateful, live-tracked checklist was considered and rejected — it would
need new schema purely to track one-time onboarding progress, which isn't
worth it for a nudge shown exactly once.

## 4. Data model

`venues` and `venue_staff` already have every column the signup flow
needs. One new table: `contact_submissions` (id, name, email, message,
created_at), service-role-only (same zero-anon-policy pattern as every
other couple/venue table), backing the marketing page's contact form.

## Testing approach

- `lib` test for the venue-provisioning function backing
  `/api/venue/signup`: creates a venue + venue_staff row for a fresh user;
  called twice for the same user returns the same venue id both times
  (idempotency); a user who already has a venue via the normal seeding
  path is unaffected.
- Component test for the signup form: submits venue name/email/password,
  asserts both calls happen in order, asserts redirect to
  `/venue/welcome` on success, asserts the inline error path.
- Live verification (per this project's convention) of the full flow:
  sign up as a brand-new venue, land on the welcome screen, click through
  to the empty dashboard.
