# Hosting (INFRA-001)

Where production runs, who can change it, and who can see the data. No credentials here: see [SECRETS.md](SECRETS.md).

## Summary

| Layer | Provider | Account / project | Region | Plan |
|---|---|---|---|---|
| Web app (Next.js, API routes, middleware) | **Vercel** | Team *GoDevLab Production's projects* (`godevlab-productions-projects`), project **`wedding-planner`** | Functions: **`dub1`** (Dublin), set in `vercel.json` | **Pro required** (Hobby forbids commercial use, INFRA-007) — *pending approval* |
| Database, Auth, Storage | **Supabase Cloud** | Organization *Wedding Planner*, project **`kade-sum`** (ref `vltzigldrqcvkxwylzbx`) | **`eu-west-1`** (Ireland) | **Pro required** (daily backups, raised upload limit, custom SMTP limits) — *pending approval* |
| DNS / domain | *To be bought* (INFRA-002). Recommended: Cloudflare DNS | — | — | — |
| Transactional email | **Resend** (INFRA-006), on a verified subdomain | *to create* | EU | Free tier to start |
| Error tracking | **Sentry** (OBS-001), EU data region | *to create* | EU (`de.sentry.io`) | Developer/Team |
| Off-site backups | **Cloudflare R2** (DATA-001), EU-jurisdiction bucket | *to create* | EU | Pay as you go |
| Rate limiting store | **Postgres** (`rate_limits` table in the same Supabase project, migration 0037) — no extra provider | — | `eu-west-1` | — |

Why these regions: users and their guests are in North Macedonia / the EU; keeping the function region equal to the database region makes every server-side query a same-region round trip (measured from a laptop in Skopje to `eu-west-1`: 120–370 ms per request; same-region: single-digit ms).

## Environments

| Environment | App | Database | Notes |
|---|---|---|---|
| Production | Vercel Production (branch `main`) | Supabase `kade-sum` | The only place real personal data lives |
| Preview | Vercel Preview deployments | **Must be a separate staging Supabase project** (REL-002 / DATA-010) | Until staging exists, previews point at `kade-sum` — acceptable only before launch |
| Local | `npm run dev` | A non-production project or local Docker Supabase | Never production keys (DATA-010) |
| Tests | Vitest | Local Docker Supabase only (enforced by `vitest.setup.ts`) | |

## Access (roles, not people)

| Action | Who | Where it is controlled |
|---|---|---|
| Deploy to production | Owners/members of the Vercel team; after CICD-003 only via merges to `main` with the gated `production` GitHub environment | Vercel team members, GitHub branch protection (CICD-006) |
| Apply database migrations | Supabase org owners/admins, via `npx supabase db push` or the CI job (DATA-003) | Supabase org members; CI secret `SUPABASE_ACCESS_TOKEN` |
| Read production data (dashboard / SQL editor) | Supabase org owners/admins/developers | Supabase org roles — keep this list short |
| Read logs | Vercel team members (function logs), Supabase org members (API/auth logs) | |
| Rotate keys | Supabase org owner, Vercel team owner | [SECRETS.md](SECRETS.md) |

Keep member lists minimal and review them quarterly. Every person with Supabase org access can read guests' personal data.

## Open hosting questions (from 00-target-overview.md)

| Question | Answer |
|---|---|
| Supabase Pro approved, which region? | Region decided: **`eu-west-1`** (project already created there). **Pro: pending owner approval.** |
| Vercel Pro approved? | **Pending owner approval.** Required before launch (commercial use). |
