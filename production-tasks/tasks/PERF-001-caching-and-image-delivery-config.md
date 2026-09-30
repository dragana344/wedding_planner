# PERF-001 - Caching and image delivery config

**Category:** performance · **Priority:** P2 · **Effort:** S · **Depends on:** INFRA-001, SEC-024

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Set cacheControl on public storage uploads (menu, showcase, invitation photos), confirm Next's static assets are immutable-cached, and allow the Supabase storage host in images.remotePatterns so pages can later use next/image. The 8 raw <img> tags are left as they are (switching them is a frontend change).

## Coachfio reference

Coachfio caches hashed assets forever, revalidates everything else, and serves images sized for where they are shown.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `api/main.py (Cache-Control immutable vs no-cache)`
- `tools/make_webp.py`

## Steps

Target files:

- `next.config.mjs`
- `supabase/migrations (bucket cache-control)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Public photos carry long-lived cache headers.
- [ ] Static assets are served with immutable caching.

## Verification

- `curl -sI <public photo url> | grep -i cache-control`

## Out of scope

- Replacing <img> with next/image.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
