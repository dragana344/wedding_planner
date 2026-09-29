# OBS-007 - Product analytics with consent

**Category:** observability · **Priority:** P2 · **Effort:** M · **Depends on:** COMP-002

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Tool choice and possibly a consent banner.

## Context

Decide a privacy-friendly analytics tool (e.g. Plausible, no cookies, or GA4 behind consent), and track the funnel: marketing visit -> signup -> first event created -> couple credentials issued -> invitation sent -> first RSVP. Never send guest or couple personal data.

## Coachfio reference

Coachfio measures its funnel (visits -> signups -> first analysis) and loads analytics only after consent.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `admin/ga4.py`
- `frontend/consent.js`
- `docs/analytics-events.md`

Commits: `849dcee`

## Steps

Target files:

- `lib/analytics.ts (new)`
- `docs/production/ANALYTICS.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] The funnel is visible in a dashboard.
- [ ] No personal data in events; consent respected if cookies are used.

## Verification

- Check the analytics dashboard after a staging walkthrough.

## Out of scope

- Visible banners unless cookies require consent.
