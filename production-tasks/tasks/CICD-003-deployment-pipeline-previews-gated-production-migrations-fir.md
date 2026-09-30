# CICD-003 - Deployment pipeline: previews, gated production, migrations first

**Category:** ci-cd · **Priority:** P0 · **Effort:** M · **Depends on:** CICD-001, DATA-003, REL-002

**Requires approval:** no · **Touches logic or frontend:** no

## Context

Connect the repo to the host: preview deploy per PR against the staging Supabase project; production deploy only from main after CI is green; apply pending migrations to the target project (`supabase db push`) before the app version that needs them goes live.

## Coachfio reference

Coachfio deploys from main only, stamps the image with the git SHA, and a scheduled CI job checks the live box is running reviewed code.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `DEPLOY.md`
- `tools/deploy_binding.py`
- `.github/workflows/ci.yml (deployed-code job)`

Commits: `40c30f7`

## Steps

Target files:

- `(host project settings)`
- `.github/workflows/deploy.yml (new)`
- `docs/production/DEPLOY.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] Merging to main deploys to production only when CI passed.
- [ ] Migrations run before the app deploy; a failed migration stops the deploy.

## Verification

- Merge a trivial change; watch CI -> migrations -> deploy.

## Out of scope

- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
