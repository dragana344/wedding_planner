# SEC-027 - Minimum strength for couple passwords

**Category:** security · **Priority:** P1 · **Effort:** S · **Depends on:** SEC-006

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Staff can no longer set short couple passwords; the form shows a rule.

## Context

Staff type the couple's password by hand in NewEventForm (the random generator is optional) and create_event_credentials accepts anything - '1234' included. The per-username lockout slows guessing but a 4-digit password falls in a day of patient tries. Enforce a minimum (e.g. 10 characters) inside create_event_credentials and regenerate_event_password, and show the rule in the form.

## Coachfio reference

Coachfio never lets a person-chosen credential be the weak link; the provider enforces the policy.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/auth/ (provider password policy)`

## Steps

Target files:

- `supabase/migrations/00xx_couple_password_policy.sql (new)`
- `components/venue/NewEventForm.tsx (reference)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A password under the minimum is refused by the database function.
- [ ] The generated password always satisfies it.

## Verification

- `select create_event_credentials('<event>', 'u', '1234'); -> error`

## Out of scope

- Changing the username rules.
