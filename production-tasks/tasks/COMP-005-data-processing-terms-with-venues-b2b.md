# COMP-005 - Data processing terms with venues (B2B)

**Category:** compliance · **Priority:** P1 · **Effort:** M · **Depends on:** COMP-001

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Legal document and possibly a signup acceptance step.

## Context

Venues upload their clients' and guests' personal data, which makes each venue a controller and the platform its processor (GDPR Art. 28 / the Macedonian Law on Personal Data Protection). Venues need a data processing agreement: subject matter, data categories, sub-processors (Supabase, Vercel, Resend, Sentry), security measures, breach notification, deletion at end of contract. Accepting it becomes part of signup or the first sale.

## Coachfio reference

Coachfio records its legal position with sources, per counterparty.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `docs/ea-content-position.md (sourced legal position)`

## Steps

Target files:

- `docs/legal/DPA.md (new)`
- `app/terms/page.tsx (reference)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A DPA exists in MK and EN and has been reviewed.
- [ ] Sub-processor list matches COMP-003.

## Verification

- Legal review record in docs/production/LEGAL-REVIEW.md

## Out of scope

- Payment terms (sales are off-platform).
