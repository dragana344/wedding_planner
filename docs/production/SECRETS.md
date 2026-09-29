# Secrets and environment variables (INFRA-003)

Rules:

1. Production secrets live **only** in the host's encrypted settings: Vercel → Project → Settings → Environment Variables (marked **Sensitive**), GitHub → Settings → Secrets (for CI), Supabase dashboard (SMTP password). Never in git, chat, tickets or `.env.local`.
2. Every environment has its **own** keys. The production service-role/secret key is never used in Preview, local dev or tests.
3. Anything with a `NEXT_PUBLIC_` prefix is shipped to every browser. Only public values get that prefix.
4. `.env.local.example` lists every variable with placeholder values only.

## Variables

| Variable | Secret? | Used by | Production | Preview | Local | Owner | Rotation |
|---|---|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | No | Browser + server | prod project URL | staging project URL | local or dev project | Supabase org owner | Changes only if the project moves |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No (public by design; RLS is the gate) | Browser + server | prod publishable key | staging | local/dev | Supabase org owner | See *Supabase keys* |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes — bypasses RLS** | Server only (`lib/supabase/service-role.ts`, guarded by `server-only`) | prod secret key, **Sensitive** | staging secret key | local/dev | Supabase org owner | See *Supabase keys* |
| `CRON_SECRET` | **Yes** | Authenticates Vercel Cron calls to `/api/cron/*` (storage cleanup, DATA-011) | random 32+ chars, Sensitive | unset (cron not run on previews) | unset | Vercel team owner | Generate a new value, update Vercel, redeploy |
| `RELEASE_SHA` | No | `/api/health` release id, set by `deploy.yml` on each production deploy | set per deploy | — | unset | — | — |
| `VERCEL_GIT_COMMIT_SHA` | No | `/api/health` release id | set by Vercel | set by Vercel | unset (`dev`) | — | — |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | No (DSN is public) | Error reporting (OBS-001, planned) | prod DSN | same project, `environment=preview` | unset | Sentry org owner | Regenerate client key in Sentry |
| `SENTRY_AUTH_TOKEN` | **Yes** | Build: source-map upload (planned) | Sensitive | Sensitive | unset | Sentry org owner | Revoke + create org token |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Token **yes** | Rate limiting (SEC-002, planned) | injected by the Upstash integration | separate DB | unset (limiter off) | Vercel team owner | Rotate in Upstash, redeploy |
| Resend API key | **Yes** | Supabase Auth SMTP password (INFRA-006) and contact-form mail (OBS-005, planned) | Supabase dashboard / Vercel Sensitive | — | — | Resend account owner | Create new key, update Supabase SMTP + Vercel, delete old |

CI-only secrets (GitHub → Settings → Secrets → Actions, `production` environment):

| Secret | Purpose | Rotation |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal/CI token for `supabase db push` in the deploy job | Revoke at supabase.com/dashboard/account/tokens, create new |
| `SUPABASE_DB_PASSWORD` | Database password for `db push` / `pg_dump` | Supabase → Settings → Database → Reset password; update the secret |
| `SUPABASE_PROJECT_REF` | Not secret; project to link | — |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET` | Off-site backups (DATA-001) | Cloudflare → R2 → API tokens: create new (bucket-scoped), update secrets, delete old |

## Supabase keys

The project has both the new keys (`sb_publishable_…`, `sb_secret_…`) and the legacy JWT keys (`anon`, `service_role`). The code works with either (same variable names).

- **Prefer the new keys.** A `sb_secret_` key can be rotated on its own and is refused when sent from a browser. The legacy `service_role` JWT can only be invalidated by rotating the project's JWT secret, which logs every user out.
- **Rotate a secret key:** Supabase → Settings → API Keys → create a new secret key → put it in Vercel (Production, Sensitive) → redeploy → confirm `/api/health` is 200 → delete the old key.
- **After switching to the new keys everywhere:** Supabase → Settings → API Keys → *Disable legacy API keys*.
- **If a secret key leaks:** delete it immediately in the dashboard (it stops working at once), create a new one, update Vercel, redeploy. Review Supabase logs for use of the old key.

## Checks

```bash
# No key material anywhere in git history (run after any suspected leak and before launch)
git log -p --all | grep -nE 'service_role|eyJhbGci|sb_secret_' || echo clean

# The service-role key never reaches the browser bundle
npm run build && (grep -rl SUPABASE_SERVICE_ROLE_KEY .next/static || echo not-in-client-bundle)
```

Status (29 Sep 2026): history clean (2 commits, no env file ever committed); `.env*` is git-ignored except `.env.local.example`.
