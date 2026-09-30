# INFRA-007 - Vercel plan for commercial use and region placement

**Category:** infra · **Priority:** P0 · **Effort:** S · **Depends on:** INFRA-001

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Vercel's Hobby plan is for non-commercial use only - a product sold to venues needs Pro. Also pin serverless/middleware execution to the region of the Supabase project (e.g. fra1 with Supabase eu-central-1): middleware queries the database on every couple request, so a cross-Atlantic default region adds latency to every page.

## Coachfio reference

Coachfio's app and database sit next to each other; every request that crosses a region pays for it.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `DEPLOY.md (one box, measured latency)`

## Steps

Target files:

- `docs/production/HOSTING.md`
- `vercel.json (new, regions)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Production runs on a commercial Vercel plan.
- [ ] Function region equals the Supabase region.

## Verification

- Vercel dashboard -> Settings -> Functions region
- Measure TTFB of /couple on production

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
