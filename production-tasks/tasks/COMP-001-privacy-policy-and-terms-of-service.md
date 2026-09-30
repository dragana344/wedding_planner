# COMP-001 - Privacy policy and terms of service

**Category:** compliance · **Priority:** P0 · **Effort:** M · **Depends on:** COMP-003

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** New public pages (MK + EN) and a signup acceptance line. Reviewer decided: a dedicated AI legal reviewer.

## Context

The product collects personal data about people who never signed up (wedding guests: names, phones, notes; couples' contact details) and has no privacy policy or terms. Write both from the data map (COMP-003): controller/processor roles (the venue is likely the controller for its guests, the platform a processor - needs legal review), processors, retention (DATA-007), rights and how to exercise them (DATA-006). DECIDED 27 Sep 2026: both documents in Macedonian and English (a language switch or two routes, e.g. /privacy and /en/privacy), reviewed by a dedicated AI legal reviewer before publishing. Record the review (date, model, findings, what changed) in docs/production/LEGAL-REVIEW.md. Link from the footer and signup.

## Coachfio reference

Coachfio's privacy policy is written from the code - every processor named is really wired up, every retention figure is really enforced - and tests keep the two in step.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `web/src/pages/legal/Privacy.tsx`
- `web/src/pages/legal/Terms.tsx`
- `tests/test_retention_matches_the_policy.py`

Commits: `610a50b`, `2e6e9d6`

## Steps

Target files:

- `app/privacy/page.tsx (new)`
- `app/terms/page.tsx (new)`
- `components/marketing/* (footer links)`
- `components/auth/SignupForm.tsx (acceptance line)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] /privacy and /terms exist and are linked from the marketing page and signup.
- [ ] Every processor and retention period in the text matches reality.

## Verification

- docs/production/LEGAL-REVIEW.md records the AI review of both languages and how each finding was resolved.
- The MK and EN versions state the same facts (same processors, periods, rights).

## Out of scope

- Other marketing copy changes.
