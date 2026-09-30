# SEC-002 - Rate limiting on public and credential endpoints

**Category:** security · **Priority:** P0 · **Effort:** M · **Depends on:** INFRA-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

There is no request-level limiting anywhere. The DB lockout in verify_event_credentials (5 tries / 15 min per username) protects one username but not a spray across usernames, and the public RSVP and contact endpoints write to the DB with no limit at all (an attacker can fill a couple's guest list or the contact table). Add a shared limiter keyed on client IP (x-forwarded-for from the trusted proxy only) backed by a store that works on the host (Upstash Redis on Vercel, or a Postgres table). Suggested budgets to confirm: couple login 10/min/IP, RSVP 20/h/IP per slug, contact 5/h/IP, signup 5/h/IP, photo upload 20/h/event. Over the limit returns 429 with the route's existing localized message style.

## Coachfio reference

Coachfio rate-limits per IP in Redis; every route that sends email or costs money fails CLOSED when the limiter is down, everything else fails open, and a limiter outage answers 503 rather than a false 'too many attempts'.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/auth/ratelimit.py`
- `api/routes/client_errors.py`

Commits: `a5c0070`, `cc6c05e`, `6697bad`

## Steps

Target files:

- `middleware.ts or lib/security/rate-limit.ts (new)`
- `app/api/couple/login/route.ts`
- `app/api/invite/[slug]/rsvp/route.ts`
- `app/api/venue/contact/route.ts`
- `app/api/venue/signup/route.ts`
- `app/api/couple/invitation/photo/route.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Each listed route returns 429 once its budget is exceeded, and recovers after the window.
- [ ] Limiter unavailability: login/signup/contact fail closed (503), others fail open - documented per route.
- [ ] Unit tests cover allow, over, and store-down for the limiter.

## Verification

- `for i in $(seq 1 15); do curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<domain>/api/couple/login -d '{"username":"x","password":"y"}'; done  # expect 401s then 429`

## Out of scope

- Changing the DB lockout rules.
- CAPTCHA (SEC-013).
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
