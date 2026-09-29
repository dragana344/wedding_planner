# COMP-004 - Keep private pages out of search engines

**Category:** compliance · **Priority:** P1 · **Effort:** S · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

There is no robots.txt and no noindex anywhere. The invitation page shows couples' names, date and venue - if a link is posted publicly it can be indexed. Add robots.txt (allow /, disallow /venue, /couple, /invite, /api), `robots: { index: false }` metadata on invite, couple and venue layouts, and X-Robots-Tag: noindex on those paths and /api.

## Coachfio reference

Coachfio opens to crawlers exactly the public pages and marks everything else noindex.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `frontend/robots.txt`
- `api/main.py (X-Robots-Tag noindex on /api/)`

Commits: `bd58c4a`

## Steps

Target files:

- `app/robots.ts (new)`
- `app/invite/[slug]/page.tsx (metadata only)`
- `app/couple/(protected)/layout.tsx (metadata only)`
- `app/venue/layout.tsx (metadata only)`
- `next.config.mjs (X-Robots-Tag headers)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] /invite, /venue, /couple and /api responses carry noindex.
- [ ] robots.txt disallows them; the marketing page stays indexable.

## Verification

- `curl -sI https://<domain>/invite/x | grep -i x-robots-tag`
- `curl https://<domain>/robots.txt`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
