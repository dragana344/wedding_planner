# INFRA-008 - Auth emails in Macedonian from the product's own sender

**Category:** infra · **Priority:** P1 · **Effort:** S · **Depends on:** INFRA-006

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** User-visible email copy.

## Context

Signup confirmation, password reset and email-change emails are Supabase's English defaults. Write Macedonian templates (with an English line), keep them in the repo, and configure them for production.

## Coachfio reference

Coachfio sends every email in the product's voice from its own domain.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/notify/templates.py`

Commits: `849dcee`

## Steps

Target files:

- `supabase/templates/*.html (new)`
- `supabase/config.toml ([auth.email.template])`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Confirmation and reset emails arrive in Macedonian from the product domain.

## Verification

- Trigger each email on staging.

## Out of scope

- Marketing emails.
