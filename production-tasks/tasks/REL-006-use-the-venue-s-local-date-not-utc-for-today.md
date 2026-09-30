# REL-006 - Use the venue's local date, not UTC, for 'today'

**Category:** reliability · **Priority:** P1 · **Effort:** S · **Depends on:** TEST-001

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** Fixes displayed dates during the first 1-2 hours after midnight - a behaviour change, though it corrects a bug.

## Context

`new Date().toISOString().slice(0, 10)` is always the UTC date, in the browser too. Between 00:00 and 01:00/02:00 in Skopje (CET/CEST) every 'today' above is still yesterday: overdue checklist items, this-week events and today's reservations are off by a day. app/venue/page.tsx already formats in Europe/Skopje - reuse that as one shared helper (todayIn(timeZone)) and use it in all five places.

## Coachfio reference

Coachfio never lets a server clock decide a user's calendar day.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `core/config.py (explicit timezones)`

## Steps

Target files:

- `lib/venue/reservations.ts:202`
- `lib/couple/checklist.ts:218`
- `components/venue/dashboard/EventsClient.tsx:84`
- `components/venue/dashboard/ClientsClient.tsx:72`
- `components/couple/ChecklistClient.tsx:213`
- `lib/date.ts (new helper)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] All five places compute 'today' in Europe/Skopje.
- [ ] A test pins 00:30 Skopje time to the correct date.

## Verification

- vi.setSystemTime('2026-06-14T22:30:00Z') -> today === '2026-06-15'

## Out of scope

- Per-venue time zones (single-country product for now).
