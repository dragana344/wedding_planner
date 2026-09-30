# INFRA-001 - Decide and document the production hosting target

**Category:** infra · **Priority:** P0 · **Effort:** S · **Depends on:** none

**Requires approval:** no · **Touches logic or frontend:** no

## Context

DECIDED 27 Sep 2026: Vercel for the Next.js app, Supabase Cloud for database/auth/storage, Resend for email, a domain still to be bought. Record this and the facts that follow from it: which Supabase plan (PITR needs Pro), which region, which Vercel project, who owns each account. Every infra/ci-cd task below reads this file. If a different target is chosen (e.g. self-hosted Node + self-hosted Supabase), the dependent tasks keep their intent and change only the mechanism - note that here.

## Coachfio reference

Coachfio writes down exactly where production runs (one droplet, Docker Compose, Caddy, Postgres, R2) and every command that touches it lives in DEPLOY.md. Nothing about production is tribal knowledge.

Files (in `~/Desktop/GoDevLab/Current Projects/coachfio`):

- `DEPLOY.md`
- `SETUP.md`
- `docker-compose.prod.yml`

Commits: `1792f7b`

## Steps

Target files:

- `docs/production/HOSTING.md (new)`

1. Read the target files and the Coachfio reference above.
2. Implement the change described in Context, adapted to Next.js 14 + Supabase.
3. Add or update tests so the acceptance criteria are checked automatically where possible.
4. Run the verification below and paste the output into the PR.

## Acceptance criteria

- [ ] docs/production/HOSTING.md exists and names: app host, DB/auth/storage host, region, plan, account owners (roles, not credentials).
- [ ] Every open question in 00-target-overview.md marked 'hosting' is answered in it.

## Verification

- Review: the file answers 'where does prod run, who can deploy, who can see the DB' without asking anyone.

## Out of scope

- Creating accounts or projects (that is INFRA-002/REL-002).
- Any change to what a user sees or can do in the app, or to domain rules (events, guests, seating, menus, reservations, budgets).
