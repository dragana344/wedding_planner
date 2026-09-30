# INFRA-002 - Domain, TLS and canonical host

**Category:** infra · **Priority:** P0 · **Effort:** S · **Depends on:** INFRA-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

The domain is not bought yet (decided 27 Sep 2026): buy it at a registrar that allows full DNS control, keep it separate from any email-forwarding service (see INFRA-006). Attach it to Vercel, enable TLS, and make exactly one host canonical (apex or www) with a 308 from the other that keeps path and query. Set Supabase Auth 'Site URL' to the canonical https origin (see SEC-012).

## Coachfio reference

Coachfio serves one canonical host: www permanently redirects to the apex with path and query kept, because two hosts with one content made Google pick the wrong canonical. TLS is automatic.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `deploy/Caddyfile`

Commits: `bd58c4a`

## Steps

Target files:

- `docs/production/HOSTING.md`
- `(host dashboard config, e.g. Vercel domains)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] https://<domain>/ serves the app with a valid certificate.
- [ ] The non-canonical host answers 308 to the canonical one, preserving path and query.
- [ ] http:// redirects to https://.

## Verification

- `curl -sI http://<domain>/x?y=1 | grep -i location`
- `curl -sI https://www.<domain>/x?y=1 | grep -i location`

## Out of scope

- DNS for email (INFRA-006).
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
