# INFRA-006 - Production email: custom SMTP for Supabase Auth plus SPF/DKIM/DMARC

**Category:** infra · **Priority:** P0 · **Effort:** M · **Depends on:** INFRA-002

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Supabase's built-in SMTP is rate-limited to a handful of emails per hour and is not for production: signup confirmation and password reset (AUTH-002) would stop working with a few real users. DECIDED 27 Sep 2026: Resend. Verify a sending subdomain (e.g. send.<domain>) in Resend, add its SPF/DKIM records plus a DMARC record on the apex, and set Resend as custom SMTP in the production Supabase project. The same Resend account sends team notifications (OBS-005). Customise the auth email templates' sender name only if approved (templates are user-visible text).

## Coachfio reference

Coachfio sends through Resend on a verified subdomain with SPF/DKIM, and DEPLOY.md records the DNS traps that once silently killed sign-in emails (forwarding mode deleting MX, duplicate SPF records).

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `DEPLOY.md (Email section)`
- `core/notify/`

Commits: `849dcee`, `1963ad4`

## Steps

Target files:

- `(Supabase Auth SMTP settings)`
- `docs/production/EMAIL.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Signup confirmation and password-reset emails arrive in Gmail and Outlook inboxes (not spam) from the production domain.
- [ ] SPF, DKIM and DMARC pass (mail-tester or Gmail 'show original').
- [ ] Auth email rate limit in Supabase is raised to match the provider.

## Verification

- Trigger a password reset on production for a test account; inspect headers for spf=pass dkim=pass dmarc=pass.

## Out of scope

- Marketing email.
- Changing auth email wording without approval.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
