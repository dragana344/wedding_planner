# OBS-005 - Deliver contact-form submissions to the team

**Category:** observability · **Priority:** P1 · **Effort:** S · **Depends on:** INFRA-006, SEC-002

**Requires approval:** no · **Touches logic or frontend:** no

## Context

contact_submissions is written and never read by anyone (its migration says so). Send each submission to a configured team address through Resend (INFRA-006) (best-effort: a mail failure must not fail the user's submission, which is already stored).

## Coachfio reference

In Coachfio a new support ticket notifies the team by email; a message stored where nobody looks is a lost lead.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/support/ (new ticket -> ADMIN_EMAILS)`

## Steps

Target files:

- `lib/venue/contact.ts`
- `app/api/venue/contact/route.ts`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] A contact submission produces an email to the team address; a mail outage still returns ok to the user.

## Verification

- Submit the contact form on staging; receive the email.

## Out of scope

- Changing the form or its success message.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
