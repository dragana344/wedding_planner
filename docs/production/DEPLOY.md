# Deploying and rolling back (CICD-003, CICD-004)

## Pipeline

```
PR ──► CI (lint, typecheck, unit, build, audit, secret scan, migrations-from-zero + DB tests)
   └─► Vercel Preview deployment (Git integration; staging Supabase)

merge to main ──► CI on main ──green──► deploy.yml
                                         1. migrate  (environment: production, needs approval)
                                            - production has no migrations missing from the repo
                                            - supabase db push
                                            - supabase db diff --linked is empty (no drift)
                                         2. deploy   (vercel build --prod + deploy --prebuilt --prod)
                                            - RELEASE_SHA=<commit> set on the deployment
                                            - smoke check: /api/health is ok
```

A failed migration stops the job before the app is deployed. Production auto-deploys from Vercel's Git integration are disabled for `main` (`vercel.json` → `git.deploymentEnabled.main: false`), so the only way to production is this workflow (or a documented manual rollback). `release-check.yml` runs hourly and fails if the live `/api/health` release is not a commit on `main` (CICD-005).

## One-time setup (owner)

**GitHub → Settings → Environments → `production`:** required reviewer = you; deployment branches = `main` only. Add to that environment:

| Kind | Name | Value |
|---|---|---|
| Secret | `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens (a token for a CI/owner account) |
| Secret | `SUPABASE_DB_PASSWORD` | production database password |
| Secret | `VERCEL_TOKEN` | vercel.com/account/tokens, scoped to the GoDevLab team |
| Variable | `SUPABASE_PROJECT_REF` | `vltzigldrqcvkxwylzbx` |
| Variable | `VERCEL_ORG_ID` | `team_azjUIFBszgMapl6ATMrgIdvo` |
| Variable | `VERCEL_PROJECT_ID` | `prj_NAllQFoiryTcjWG07dEsHL4VU3t3` |
| Variable | `PRODUCTION_URL` | e.g. `https://<domain>` (repository-level variable too, for `release-check.yml`) |

**Vercel → wedding-planner → Settings → Git:** connect the GitHub repository (for previews).

**GitHub → Settings → Branches:** protect `main` (CICD-006): require a PR, require the `CI` checks (`Lint, typecheck, unit tests, build`, `Dependency audit`, `Secret scan`, `Migrations and DB tests`) to pass, no force pushes, no deletions, include administrators.

## Manual deploy (only if the pipeline is down)

```bash
git checkout main && git pull
npx supabase link --project-ref vltzigldrqcvkxwylzbx
npx supabase db push                 # migrations first
vercel deploy --prod                 # then the app
curl -s https://<domain>/api/health  # {"ok":true,...}
```

## Maintenance mode (REL-007)

For a migration that needs downtime (rare: prefer expand/contract, [MIGRATIONS.md](MIGRATIONS.md)):

1. Vercel → Settings → Environment Variables (Production): `MAINTENANCE_MODE=1`, and `MAINTENANCE_BYPASS_TOKEN=<random>` (Sensitive). Redeploy (Deployments → ⋯ → Redeploy, no rebuild needed) — env changes apply on the next deployment.
2. Everyone gets a 503 page in Macedonian with `Retry-After`; API callers get a JSON 503. `/api/health` keeps reporting the real state.
3. The team opens `https://<domain>/?maintenance_bypass=<token>` once; a 12-hour cookie lets them use the app normally to check the work.
4. Post the window on the uptime provider's public status page (OBS-003) beforehand, so venues see it.
5. Done: delete `MAINTENANCE_MODE`, redeploy, rotate the bypass token.

## Rollback runbook

**Is it the app or the data?** Check `/api/health`, Vercel → Deployments → the latest one's logs, and Sentry (OBS-001).

### 1. Roll the app back (usually enough, ~1 minute)

- Vercel dashboard → wedding-planner → Deployments → pick the last good production deployment → **⋯ → Instant Rollback** (or `vercel rollback <deployment-url>`).
- Verify: `curl -s https://<domain>/api/health` shows the previous release SHA; reproduce the bug is gone.
- This is safe because every migration follows expand/contract ([MIGRATIONS.md](MIGRATIONS.md)): the previous app version works with the current schema.
- Note: after an instant rollback Vercel stops auto-assigning new production deployments until you promote one again; the next `deploy.yml` run does that.

### 2. Roll a migration back (rare)

Migrations are never "down"-migrated in place. Write a new forward migration that undoes the change (e.g. re-grant a privilege, drop a new constraint), verify it locally from zero, merge it; the pipeline applies it.

### 3. Restore data (last resort)

See the restore procedure (DATA-002, [BACKUPS.md](BACKUPS.md)): Supabase daily backups / PITR for the database, R2 copies for storage objects. Restoring replaces all data changed since the backup — decide together with the venue(s) affected.

### Rehearsal log

| Date | Environment | What | Time | Notes |
|---|---|---|---|---|
| — | staging | *to do once staging exists* | | |
