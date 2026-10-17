# Venue manager/staff roles — design

Date: 2026-10-14 · Status: approved in conversation, awaiting written-spec review

## 1. Goal

A venue today has exactly one login, shared by whoever is at the front desk and by whoever owns/manages the place — anyone signed in can do anything. Real venues run on a shared terminal (the "computer behind the counter"), with one or more people who should be able to do everything (managers) and others who should only see things, not change them (staff).

Success:
- The venue's existing single login becomes the **base/staff session** — unchanged for anyone just using it as-is today.
- One or more **managers** can be defined per venue, each identified by their own name + password (not a separate email/account).
- From the shared staff session, entering a manager's name + password **elevates** that browser tab to manager-level access until explicitly logged out or the page is reloaded/the browser restarts.
- Exactly one manager is the **owner** (auto-created at signup), who alone can add or remove other managers.
- Permission checks are enforced **server-side**, not just by hiding buttons.

## 2. Decisions taken

| # | Decision |
|---|---|
| D1 | No new Supabase Auth accounts for managers. One real login per venue (today's), used as the base/staff session. A manager is a `(name, password)` pair scoped to that venue. |
| D2 | Elevation state lives only in the browser tab's memory (never a cookie/localStorage) and is re-verified server-side on every manager-gated action. Refreshing the page, closing the tab, or restarting the browser drops back to staff level. |
| D3 | Exactly one manager per venue is flagged `is_owner`. Only the owner can add or remove managers. Every other manager has identical power otherwise. |
| D4 | Поставки (the full settings page — MFA, branding, data export, account deletion, floor-plan lock password) is owner-only. A non-owner manager's only self-service action is changing their own manager password, available directly from the account menu, not through Поставки. |
| D5 | A lost manager password is reset by platform support from the admin panel, after the venue calls in — one named manager at a time, never a blanket reset of everyone. *(Revised: the original email-link recovery was built and then removed, migrations 0099/0103 — no email is stored per manager, and the app owner wants recovery to go through support.)* |
| D6 | New venues set their owner's name + manager password as part of signup. Existing (pre-feature) venues are backfilled with a single owner, name `owner`, password `owner12345` — acceptable because no real venues are live yet; this must not be reused once real venues exist. |
| D7 | Elevated actions are attributed by manager name in the audit log, in addition to the existing `actor_id` (which stays the base account's user id — managers aren't separate `auth.users` rows). |
| D8 | Repeated failed elevation attempts lock out, same 5-strike pattern already used for couple/co-organizer logins (migrations 0045/0061). |

## 3. Permission matrix

| Area | Staff (base) | Manager | Owner |
|---|---|---|---|
| View events / clients | ✅ | ✅ | ✅ |
| Create / edit / delete events | ❌ | ✅ | ✅ |
| Распоред на маси (venue's own rooms/tables) | ✅ edit | ✅ edit | ✅ edit |
| Per-event seating plan (from couples) | 👁 view only | ✅ edit | ✅ edit |
| Мени/Пакети | ✅ edit | ✅ edit | ✅ edit |
| Поддршка | ✅ | ✅ | ✅ |
| Известувања, Календар/Планер | ✅ | ✅ | ✅ |
| Извештаи | ❌ hidden | ✅ | ✅ |
| Поставки (full page) | ❌ hidden | ❌ hidden | ✅ |
| Change own manager password | — | ✅ (own only) | ✅ (own only) |
| Add / remove a manager | ❌ | ❌ | ✅ |

Unlisted sections (Контролна табла, Мени/Пакети, Поддршка, etc.) are unaffected — identical for staff and managers, as today.

## 4. Data model

New table, `venue_managers`:

```sql
create table venue_managers (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references venues(id) on delete cascade,
  name text not null,
  password_hash text not null,
  is_owner boolean not null default false,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  unique (venue_id, name)
);
```

- Exactly one `is_owner = true` row per venue — enforced the same way `plans.is_default` is (a partial unique index: `create unique index venue_managers_one_owner on venue_managers(venue_id) where is_owner`).
- RLS: enabled, zero anon/authenticated policies, service-role only — same convention as every couple/venue-adjacent table this session already added (`support_tickets`, etc.). The venue's own staff client never reads this table directly; elevation goes through a server route.
- `password_hash` uses the same hashing the existing event-credentials/co-organizer logins use (`create_event_credentials`'s approach, migration lookup at implementation time) for consistency, not a new scheme.
- `failed_attempts` / `locked_until` mirror the existing couple-login lockout columns (event_credentials, event_co_organizers) — same 5-strike, time-boxed lockout, reusing that pattern rather than inventing a new one.

## 5. Elevation flow ("Login as Manager")

1. From `AccountMenu`, staff-level session shows **"Логирај се како менаџер"**. Clicking it opens a small form: **name**, **password**.
2. Submitting posts to a new server route/action, which:
   - resolves the current venue from the signed-in session (never trusts a client-supplied venue id — same rule as everywhere else in this app),
   - looks up `venue_managers` by `(venue_id, name)`,
   - checks `locked_until`, verifies the password hash, and on failure increments `failed_attempts` (locking out past the threshold, same shape as the couple-login RPCs),
   - on success, resets `failed_attempts`, and returns a short-lived, signed proof of "venue X, manager Y" (a signed token expiring in 4 hours, returned in the response body — **not** set as a cookie; the expiry is a defense-in-depth backstop, not the primary way elevation ends — point 4 below is).
3. The client holds that proof only in React state (a context provider high in the venue shell), never written to storage. Every subsequent manager-gated server call attaches it (e.g. as a header), and the server independently verifies its signature + expiry + that it still matches a live, non-removed manager row before allowing the action.
4. A page reload, new tab, or browser restart has no record of the proof — back to staff level automatically. An explicit **"Одјави се од менаџер"** item in `AccountMenu` clears it immediately within the same tab.

This keeps the enforcement genuinely server-side (a tampered client-side flag can't grant access) while matching the "drops on refresh" behavviour asked for, since nothing durable is ever written for it to drop *from*.

## 6. Forgot a manager's password

*(Revised — see D5.)* There is no self-service recovery and no email link:
- The venue calls support; in the admin panel (venue detail → Менаџери) support sets a new password for **that one manager only**, typed in as dictated over the phone. It does not touch any other manager's password.
- The reset ends that manager's active elevations and clears any lockout (migration 0100), is written to the audit log, and the manager sees a one-time "your password was reset by support on [date]" notice at their next elevation (migration 0105).

## 7. Managing managers (owner only)

- Lives inside Поставки (owner-only page), new "Менаџери" section: list of managers (owner marked), each with "remove" (owner can't remove themself without first designating a new owner — out of scope for v1, see §9).
- "Add manager": owner types a name + a password on the spot and tells the new manager directly (no email invite; recovery goes through support, per §6).

## 8. Signup and existing-venue backfill

- `/signup` gains two fields alongside the existing venue name / email / account password: **owner name**, **owner manager password**. `provisionVenueForUser` (or a sibling call in the same transaction) also inserts the `venue_managers` row with `is_owner = true`.
- Existing venues (pre-feature): a one-time migration inserts one `is_owner = true` row per existing venue, name `owner`, password `owner12345` (hashed). This is acceptable only because no real venue is live yet (D6) — must not ship to a production dataset with this fixed value.

## 9. Explicitly out of scope for v1

- Transferring ownership to a different manager.
- Verifying a caller's identity before support resets a manager password (§6) — accepted for v1; a stronger check is a known follow-up.
- Any permission granularity finer than staff/manager/owner (e.g. per-feature manager permissions).
- Managers signing in from outside the venue's own base session without first having that session's credentials (i.e. this is additive to the existing login, not a replacement authentication system).

## 10. Testing approach

Matches this project's existing conventions:
- Pure unit tests for password verification/lockout logic (mirroring the couple-login lockout tests).
- A live-DB test suite covering: elevation success/failure/lockout, the one-owner-per-venue constraint, add/remove-manager authorization (owner vs non-owner manager refused), a support (admin) reset changing only the targeted manager's password.
- Component tests for the elevation form, the account-menu state changes (staff vs elevated), and that manager-gated pages/controls don't render for a non-elevated session.
- A route-level test (same shape as `tests/lib/api/route-validation.test.ts`) confirming manager-gated server actions refuse a request whose elevation proof is missing, expired, or doesn't verify.
