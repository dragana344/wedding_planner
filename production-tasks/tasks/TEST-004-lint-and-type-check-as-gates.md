# TEST-004 - Lint and type-check as gates

**Category:** testing · **Priority:** P0 · **Effort:** S · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Add `typecheck` (tsc --noEmit) and `lint` (next lint --max-warnings 0) as CI gates. Measured baseline 27 Sep 2026: `tsc --noEmit` 0 errors; `next lint` 0 errors, 1 warning (no-img-element in components/couple/InvitationClient.tsx:163); `next build` succeeds. The gates can go in as failing-on-error immediately.

## Coachfio reference

Coachfio pins its lint rules and runs lint + type checks on every push so a toolchain upgrade cannot silently change the rules.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `pyproject.toml ([tool.ruff.lint] select pinned)`

## Steps

Target files:

- `package.json`
- `.eslintrc.json`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] CI fails on a type error or lint error.

## Verification

- `npm run typecheck && npm run lint`

## Out of scope

- Fixing lint findings that would change behaviour.
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
