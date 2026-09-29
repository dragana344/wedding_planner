# SEC-021 - Protect guests' RSVP answers from being changed by other guests

**Category:** security · **Priority:** P1 · **Effort:** M · **Depends on:** SEC-018

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Changes RSVP rules and adds information to the couple's guest view; the overwrite rule is a product decision.

## Context

The invite link is shared with all guests, and submitRsvpBySlug updates the guest whose name matches exactly. So anyone with the link can decline (or confirm) someone else by typing their name. Minimum: record every public RSVP change (old value, new value, time, anonymised requester) in the audit log and show the couple the last change per guest. Stronger options to decide: refuse to flip an already-answered guest through the public form, or give each guest a personal link.

## Coachfio reference

Coachfio records who changed what so a disputed change has an answer.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `admin/storage/audit.py (answerable later)`

## Steps

Target files:

- `lib/couple/rsvp.ts`
- `app/api/invite/[slug]/rsvp/route.ts`
- `components/guests (couple view of RSVP history)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Every public RSVP change is recorded and visible to the couple.
- [ ] The chosen overwrite rule is enforced and tested.

## Verification

- Submit two RSVPs for the same name on staging; the couple sees both events.

## Out of scope

- Changing the invitation design.
