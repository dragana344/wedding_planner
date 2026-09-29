# SEC-001 - Security headers and Content-Security-Policy

**Category:** security · **Priority:** P0 · **Effort:** M · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

next.config.mjs sets no headers today. Add headers() for all routes: Strict-Transport-Security, X-Content-Type-Options nosniff, X-Frame-Options DENY (or frame-ancestors 'none'), Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy (camera/mic/geolocation off), and a CSP whose connect-src/img-src allow the Supabase project URL and storage. Ship the CSP as Content-Security-Policy-Report-Only first, collect violations for a few days, then enforce. Next.js inline bootstrap scripts need either a nonce (middleware) or 'unsafe-inline' for script-src in the interim - document the choice.

## Coachfio reference

Coachfio stamps every response with CSP (no unsafe-inline scripts), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy and HSTS, and a test fails the build if an inline script appears.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/main.py (add_security_headers)`
- `tests/test_csp.py`

Commits: `d5531ec`, `a2488ae`

## Steps

Target files:

- `next.config.mjs`
- `middleware.ts (only if a nonce-based CSP is chosen)`
- `tests/security/headers.test.ts (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Every HTML and API response carries the headers above.
- [ ] CSP is enforced (not report-only) with zero violations on every page of the venue panel, couple panel, invitation page and marketing page.
- [ ] A test asserts the header set so it cannot silently disappear.

## Verification

- `curl -sI https://<domain>/ | grep -iE 'content-security|strict-transport|x-frame|x-content-type|referrer|permissions'`
- securityheaders.com grade A or better
- Browser console on each page: no CSP violations

## Out of scope

- Rewriting components to remove inline styles.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
