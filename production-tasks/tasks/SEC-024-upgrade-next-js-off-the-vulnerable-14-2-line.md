# SEC-024 - Upgrade Next.js off the vulnerable 14.2 line

**Category:** security · **Priority:** P0 · **Effort:** L · **Depends on:** TEST-001, CICD-001

**Requires approval:** YES · **Touches logic or frontend:** YES

> **Why approval is needed:** A framework major upgrade touches every page and route; behaviour must stay identical but the risk is real and needs a staging soak.

## Context

`npm audit --omit=dev` (27 Sep 2026): 1 critical (next: DoS via Image Optimizer remotePatterns) and 1 high (postcss XSS in stringify), fix available only in Next 16.x. Plan the major upgrade: Next 14 -> 15 -> 16 with React 19, codemods for async `params`/`cookies()`, and re-check caching (Next 15 changed fetch/route caching defaults - this app already fights stale data, see next.config.mjs staleTimes and the service-role fetch override). Until upgraded, do NOT add images.remotePatterns (PERF-001 depends on this task).

## Coachfio reference

Coachfio keeps dependencies current and gated in CI, so a known-vulnerable framework never ships.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `.github/workflows/ci.yml (dependency gates)`

Commits: `3bebf2e`

## Steps

Target files:

- `package.json`
- `package-lock.json`
- `app/**/page.tsx and route.ts (async params in Next 15+)`
- `next.config.mjs`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] npm audit --omit=dev reports no high/critical.
- [ ] All unit, DB and E2E tests pass on the new version.
- [ ] No stale-data regression on the pages listed in next.config.mjs.

## Verification

- `npm audit --omit=dev --audit-level=high`
- `npm run build && npm run test:unit && npm run test:db`

## Out of scope

- Adopting new Next features beyond what the upgrade requires.
