# Database migrations (DATA-003)

## Rules

1. **The production schema changes only through `supabase/migrations/`**, applied by the deploy pipeline (`.github/workflows/deploy.yml`) or, before CI/CD is live, by an owner running `npx supabase db push`. **Never** edit schema, policies or grants in the Supabase dashboard's SQL editor or table editor on production. The deploy job fails when production differs from the migrations (`supabase db diff --linked`), so a dashboard edit blocks the next release until it is turned into a migration.
2. **Never edit a migration that has been applied to production.** Add a new one. (The one exception so far: 0012/0013 were fixed on 29 Sep 2026 before they had ever applied successfully to production — 0012 had failed and rolled back.)
3. **Numbering:** four digits, next free number, `NNNN_short_description.sql`. CI fails on duplicate prefixes.
4. **Every migration is verified locally from zero** before it is pushed: `npx supabase db reset --local && npm run test:db`. CI runs the same (`database` job).
5. **Privileges are explicit.** Supabase Cloud and the local CLI start from different default privileges, so since 0031 new tables, sequences and functions start closed to `anon`/`authenticated`. A migration that adds a table must:
   - `alter table … enable row level security;`
   - grant exactly what the browser needs to `authenticated` (nothing for server-only tables; `service_role` gets access by default);
   - classify the table in `tests/supabase/rls_guard.test.ts` (the test fails until you do).
   A new function must `set search_path = public, extensions, pg_temp` if it is `security definer`, and `grant execute` only to the roles that call it.
6. **Extensions live in the `extensions` schema** on Supabase Cloud. Call them schema-qualified (`extensions.crypt(…)`, `extensions.gen_salt(…)`).

## Expand / contract (safe rollbacks)

A deploy runs migrations first, then ships the app. The previous app version must keep working against the new schema, so an app rollback (CICD-004) never meets an incompatible database:

| Change | Release 1 (expand) | Release 2 (contract), after release 1 is stable |
|---|---|---|
| Add a column | Add it nullable or with a default; the app starts writing it | Add `not null` if needed |
| Rename a column | Add the new column, backfill, write both | Stop reading the old one; drop it |
| Drop a column/table | Stop using it in the app | Drop it |
| Tighten a constraint | Clean existing data; app validates first | Add the constraint |
| Revoke a privilege | Remove the app's use of it | Revoke |

Never combine the expand and contract steps in one release.

## Commands

```bash
npx supabase migration new <name>          # creates the next file (rename to NNNN_ if needed)
npx supabase db reset --local              # apply all migrations from zero, locally
npm run test:db                            # schema, RLS, privileges, storage policies
npx supabase migration list --linked       # what production has applied
npx supabase db push --dry-run             # what would be applied
npx supabase db diff --linked --schema public   # must print nothing (no drift)
```
