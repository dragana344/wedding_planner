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
| `NEXT_PUBLIC_SENTRY_DSN` | No (DSN is public) | Error reporting (OBS-001): browser, server, proxy. Unset = Sentry off | prod DSN | same DSN (events tagged `preview`) | unset | Sentry org owner | Regenerate client key in Sentry |
| `SENTRY_ORG`, `SENTRY_PROJECT` | No | Build: source-map upload target | set | set | unset | Sentry org owner | — |
| `SENTRY_AUTH_TOKEN` | **Yes** | Build: source-map upload (maps are deleted from the output after upload) | Sensitive | Sensitive | unset | Sentry org owner | Revoke + create org token |
| `RESEND_API_KEY` | **Yes** | Contact-form notifications via Resend HTTP API (OBS-005). The separate Supabase-SMTP key lives only in Supabase | Sensitive | unset | unset | Resend account owner | Create new key, update Vercel (and Supabase SMTP for its own key), delete old |
| `EMAIL_FROM` | No | Sender for app emails, e.g. `КАДЕ СУМ? <no-reply@mail.<domain>>` | set | unset | unset | — | — |
| `NEXT_PUBLIC_SITE_URL` | No | The public origin, e.g. `https://kadesum.mk`. Used for links the app emails to guests (invitations, reminders) and for links printed in QR codes. Unset: the request's own origin | set | unset | unset | — | — |
| `CONTACT_NOTIFY_EMAIL` | No | Team inbox for contact-form messages | set | unset | unset | — | — |
| `SECURITY_CONTACT_EMAIL` | No | Contact in `/.well-known/security.txt` (SEC-026) | set | unset | unset | — | — |
| `SUPPORT_EMAIL` | No | Address shown on the venue panel's Support page (ARCH-003); falls back to `CONTACT_NOTIFY_EMAIL` | set | unset | unset | — | — |
| `MAINTENANCE_MODE` | No | `1` serves the maintenance page to everyone but the team (REL-007) | unset normally | unset | unset | on-call | — |
| `MAINTENANCE_BYPASS_TOKEN` | **Yes** | Team bypass: open any URL once with `?maintenance_bypass=<token>` | Sensitive | — | — | on-call | Change after each maintenance window |
| `IP_PSEUDONYM_SECRET` | **Yes** | HMAC key for IP pseudonyms (rate limits, RSVP audit). Optional: falls back to the service-role key | Sensitive (random 32+ bytes) | Sensitive | unset | Vercel team owner | Rotating starts fresh rate-limit windows; old audit pseudonyms stop matching |

CI-only secrets (GitHub → Settings → Secrets → Actions, `production` environment):

| Secret | Purpose | Rotation |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal/CI token for `supabase db push` in the deploy job | Revoke at supabase.com/dashboard/account/tokens, create new |
| `SUPABASE_DB_PASSWORD` | Database password for `db push` / `pg_dump` | Supabase → Settings → Database → Reset password; update the secret |
| `SUPABASE_PROJECT_REF` | Not secret; project to link | — |
| `BACKUP_ENCRYPTION_KEY` | Encrypts backup archives (AES-256) — keep an offline copy in the password manager | Never rotate without re-encrypting or keeping the old key until old archives expire (35 days) |
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
