# SEC-014 - Keep server-only code out of client bundles

**Category:** security · **Priority:** P1 · **Effort:** S · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Every module that creates the service-role client should `import "server-only"` so a future accidental import from a client component fails the build instead of shipping the key path to browsers. Review resolve-client.ts: it switches to the service-role client when VITEST is set - make sure that branch can never be reached in a production build.

## Coachfio reference

Coachfio encodes 'this must never happen' as a build-time test rather than a convention.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `web/src (build-time contract tests)`

## Steps

Target files:

- `lib/supabase/service-role.ts`
- `lib/couple/*.ts`
- `lib/venue/provisioning.ts`
- `lib/venue/contact.ts`
- `lib/supabase/resolve-client.ts`
- `package.json`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Importing any service-role module from a 'use client' file fails `next build`.
- [ ] No reference to SUPABASE_SERVICE_ROLE_KEY in .next/static after build.

## Verification

- `npm run build && grep -r SUPABASE_SERVICE_ROLE_KEY .next/static || echo clean`

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
