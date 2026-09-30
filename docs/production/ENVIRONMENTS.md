# Environments (REL-002)

| | Production | Preview (staging) | Local dev | Tests |
|---|---|---|---|---|
| App | Vercel Production, deployed by `deploy.yml` from `main` | Vercel Preview per branch/PR (Git integration) | `npm run dev` | Vitest |
| Supabase | `kade-sum` (`vltzigldrqcvkxwylzbx`, eu-west-1) | **Separate staging project** — *to create* | Staging project or local Docker (`npx supabase start`) | Local Docker only (enforced) |
| Keys | Production keys, only in Vercel Production env | Staging keys, only in Vercel Preview env | Staging/local keys in `.env.local` | Generated `.env.test.local` |
| Real personal data | Yes | Never (DATA-010) | Never | Never |

## Validation at build and boot

`next.config.mjs` calls `assertRequiredEnv()` (`lib/required-env.mjs`) when Next builds, starts, or runs the dev server. A missing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` fails with the variable's name. On Vercel the Supabase URL must be `https` and not localhost, and the public key must not equal the service key.

## Creating the staging project (owner task)

1. Supabase → Wedding Planner org → New project `wedding-planner-staging`, region `eu-west-1` (Free plan is enough).
2. Apply migrations: `npx supabase link --project-ref <staging-ref> && npx supabase db push`, then relink production (`npx supabase link --project-ref vltzigldrqcvkxwylzbx`).
3. Vercel → wedding-planner → Settings → Environment Variables: set the three Supabase variables for **Preview** to the staging values (service key as Sensitive). Production keeps the `kade-sum` values.
4. Point your `.env.local` at staging too, so local development never touches production data.
5. Auth → URL configuration on staging: Site URL = a preview URL, redirect `https://*-godevlab-productions-projects.vercel.app/**`.

Until then, Preview deployments and local dev share the production database. That is acceptable only while there are no real users.

## Production personal data stays in production (DATA-010)

- **Never** restore, copy, export or dump production data into staging, a laptop, a test database, a spreadsheet or a chat. This includes "just one venue" and "just to reproduce a bug".
- Local and staging databases are filled from `supabase/seed.sql`: invented venues, events, guests and reservations. `npx supabase db reset` loads it. Demo logins: staff `demo@example.com` / `demo-password-123`, couple `demo-couple` / `demo-couple-123`, floor-plan lock `1234`.
- To reproduce a production bug, recreate the shape of the data in the seed or in a test, not the data itself.
- The only place a production backup may be restored is the isolated project used for the restore drill (DATA-002), which is deleted afterwards.
- Anyone with production database access (see [HOSTING.md](HOSTING.md)) is bound by this rule.
